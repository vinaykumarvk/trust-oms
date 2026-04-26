# Adversarial Evaluation: Handover & Assignment Management BRD

**Document Evaluated:** BRD-TRUSTOMS-HAM-2026-001 v1.0
**Date:** 2026-04-22
**Evaluation Method:** 5-round structured adversarial debate (Proponent / Opponent / Judge)

---

## 1. Executive Summary

The Handover & Assignment Management (HAM) BRD proposes a comprehensive module for the Trust OMS wealth management platform that enables permanent transfer (Handover) and temporary reassignment (Delegation) of Leads, Prospects, and Clients between Relationship Managers. The BRD is well-structured across 14 sections with detailed data models (9 entities), 15 functional requirements with user stories, 21 API endpoints, and complete workflow state diagrams. It is validated against three reference implementations (Maybank, HSBC, JBR).

After 5 rounds of rigorous debate, the Judge concludes that the BRD is **fundamentally sound** and covers the core handover/delegation domain comprehensively. However, several material gaps were identified: (1) bulk upload bypassing maker-checker creates a significant compliance risk, (2) no handling of concurrent handover and delegation conflicts, (3) missing partial/selective handover for multi-account clients, (4) absent data archival strategy despite 7-year retention requirement, (5) no emergency/urgent handover workflow for sudden RM departures, and (6) insufficient specification for cross-branch handover edge cases. With these addressed, the BRD is ready for implementation.

**Final Verdict: APPROVE WITH CONDITIONS** — Address the 12 critical and high-priority findings before development begins.

---

## 2. Proposal Description

The HAM module provides:
- **Handover (Permanent):** Lead, Prospect, and Client transfer between RMs with maker-checker authorization, scrutiny checklist (clients only), bulk CSV upload, and comprehensive audit trail.
- **Delegation (Temporary):** Lead, Prospect, and Client reassignment for RM absences with auto-authorization, auto-expiry, and delegation calendar.
- **Supporting Features:** Dashboard, portfolio impact assessment, pending activities warning, notification system, handover history, and reporting.

The module targets Operations Maker/Checker users, Branch Managers, and Compliance Officers, with read-only notification access for RMs.

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**PROPONENT:**

The HAM BRD is exceptionally well-crafted for an AI-buildable specification. Its strengths include:

1. **Production-validated design**: Built on three real-world implementations (Maybank, HSBC, JBR) — this is not theoretical speculation but a synthesis of proven approaches from major financial institutions.

2. **Complete data model**: 9 entities with full field specifications, data types, validation rules, defaults, and 2-3 sample data rows per entity. An AI builder can generate the database schema directly from Section 4 without ambiguity.

3. **Comprehensive acceptance criteria**: Each of the 15 functional requirements has 4-10 testable acceptance criteria, user stories, business rules, and error handling. FR-001 alone has 10 ACs, 3 business rules, and 4 error messages.

4. **Dual workflow patterns**: The Handover (permanent + maker-checker) and Delegation (temporary + auto-authorized) distinction directly addresses the two fundamental RM transition scenarios. This separation is architecturally sound — it avoids overloading a single entity with conditional authorization logic.

5. **Regulatory compliance built-in**: Immutable audit logs with 7-year retention, segregation of duties (BR-005.1), scrutiny checklist enforcement, and OWASP compliance. For a wealth management platform handling fiduciary relationships, this is essential.

6. **Enhancement layer beyond reference implementations**: AUM impact assessment (FR-013), pending activities warning (FR-014), delegation calendar (FR-011), and dashboard (FR-010) go beyond the reference docs. These are genuine value-adds for wealth management operations.

**OPPONENT:**

While the BRD has strong structural foundations, I identify several material gaps that could cause implementation failures or compliance issues:

1. **Bulk upload bypasses maker-checker — a compliance time bomb**: FR-004 explicitly states "Bulk uploads bypass maker-checker authorization" (BR-004.1). This is a critical control gap. A single Operations Maker can unilaterally reassign thousands of clients via CSV without any review. In a regulated wealth management environment, this bypasses the very control framework the rest of the BRD carefully enforces. An erroneous or malicious bulk upload could reassign an entire branch's client book in minutes.

2. **No concurrent handover/delegation conflict resolution**: What happens when a client has an active delegation and someone initiates a handover for the same client? The BRD says entities with pending handovers can't be re-selected (BR-001.2), but doesn't address the handover-delegation intersection. Can you permanently hand over a client who is currently delegated to a third RM?

3. **No emergency/urgent handover workflow**: The BRD assumes orderly transitions. In reality, RMs sometimes depart suddenly (termination, medical emergency). The standard maker-checker flow with 4-hour SLA may be too slow. There's no expedited or emergency handover path.

4. **Missing partial handover for multi-account clients**: A HNWI client may have trust accounts, investment accounts, and insurance accounts across different product lines. The BRD treats client handover as atomic — all or nothing. There's no provision for partial handover where different accounts go to different RMs.

5. **90-day delegation cap is arbitrary**: The 90-day maximum for delegations has no business justification in the BRD. Extended medical leave, secondments, or maternity/paternity leave commonly exceed 90 days. What happens then?

6. **No rollback/undo mechanism**: Once authorized, a handover cannot be reversed except by creating a new handover in the opposite direction. There's no systematic undo or correction workflow for mistaken authorizations.

**JUDGE:**

Both sides present valid arguments. The Proponent correctly identifies the BRD's structural strength — it is among the most buildable BRDs I've seen for this domain. The data model, acceptance criteria, and API specifications are genuinely comprehensive.

However, the Opponent raises several material concerns that the Proponent must address:

- The bulk upload bypass (point 1) is the most serious finding. It's a genuine compliance risk that contradicts the module's own stated objective of "maker-checker authorization to ensure operational integrity."
- The concurrent handover/delegation conflict (point 2) is a real edge case that WILL occur in production.
- The emergency handover gap (point 3) is a valid operational concern.

**Round 1 Score: Proponent 6, Opponent 7** — The Opponent identifies concrete, actionable gaps.

---

### Round 2: Rebuttal

**PROPONENT (addressing Opponent's concerns):**

1. **Bulk upload and maker-checker**: The reference implementations (Maybank, HSBC, JBR) all specify that bulk uploads do NOT require authorization — this is by design. The rationale is operational: during branch restructuring affecting hundreds of clients, requiring individual authorization would create an impossible bottleneck. However, I concede this needs guardrails. The BRD should add: (a) mandatory supervisor approval before bulk upload execution, (b) a preview/dry-run step showing affected client count and AUM before committing, (c) a 24-hour reversal window for bulk uploads.

2. **Concurrent conflicts**: This is a fair gap. The BRD should specify: if a client has an active delegation, handover should still be allowed but the delegation must be auto-cancelled upon handover authorization. The permanent transfer takes precedence over temporary delegation.

3. **Emergency handover**: The 4-hour SLA is a target, not a hard limit. For emergencies, the BRD could add an "Urgent" flag on handover requests that triggers immediate notification to all available Checkers and escalates to Branch Manager if not authorized within 1 hour.

4. **Partial handover**: Valid for large institutions but adds significant complexity. Multi-account partial handover would require the data model to support account-level RM assignment rather than client-level. This could be a Phase 2 enhancement. The current client-level approach matches all three reference implementations.

5. **90-day delegation cap**: The cap exists because regulatory requirements in many jurisdictions require formal relationship transfer documentation beyond 90 days. However, the BRD should add a "delegation extension" workflow that allows extending by another 90 days with supervisor approval.

6. **Rollback**: A dedicated undo mechanism is unnecessary overhead. Creating a reverse handover is the standard industry practice and maintains audit trail integrity. An "undo" would create confusing audit trail entries.

**OPPONENT (pressing further):**

1. **Bulk upload**: The Proponent's proposed guardrails (supervisor approval, preview, reversal window) are helpful but don't fully address the issue. A "preview/dry-run" is essential. But a "24-hour reversal window" introduces its own complexity — during those 24 hours, are the assignments actually effective? If so, the incoming RM sees clients they might lose. If not, there's a gap in coverage. The BRD needs to specify this clearly.

2. **Data model lacks version/history tracking**: The HandoverRequest entity has `updated_at` but no mechanism to track what changed. If a Checker views a handover request, then the Maker modifies it before authorization, the Checker wouldn't know. There's no optimistic locking or version field. This is a data integrity risk.

3. **Notification system has no delivery guarantee**: FR-015 specifies email and in-app notifications but has no retry mechanism, no dead-letter queue, no delivery confirmation. In a regulated environment, proof of notification delivery may be required. What happens if the email server is down when a critical handover notification needs to be sent?

4. **API gaps**: The endpoint table lists 21 endpoints but is missing key operations: (a) no PATCH/PUT for updating a pending handover request before authorization, (b) no endpoint for getting list of RMs for the Incoming RM dropdown (filtered by branch/supervisor for delegation), (c) no endpoint for delegation extension.

5. **Dashboard data freshness**: FR-010 shows a dashboard but doesn't specify data freshness/caching strategy. With 50 concurrent users hitting dashboard endpoints, and the dashboard aggregating across HandoverRequest, DelegationRequest, and portfolio data — what's the query strategy? Real-time vs. cached vs. materialized views?

**JUDGE:**

Round 2 deepens the analysis productively. Key observations:

- The Proponent's concessions on bulk upload, concurrent conflicts, and delegation extension are well-reasoned. The BRD should incorporate these modifications.
- The Opponent's new points about version tracking, notification delivery guarantees, and API gaps are technically valid. The version/optimistic locking point (2) is particularly important for a maker-checker workflow where the Checker must be confident they're authorizing exactly what the Maker submitted.
- The partial handover debate is correctly deferred to Phase 2 — it would significantly expand scope without matching any reference implementation.

**Round 2 Score: Proponent 7, Opponent 7** — Both sides sharpen their arguments effectively.

---

### Round 3: Deep Dive — Highest-Stakes Disagreements

**PROPONENT (focusing on the highest-impact topics):**

**On bulk upload risk mitigation — a complete proposal:**
The BRD should add these controls to FR-004:
- AC-004.9: Before processing, system displays a preview summary: total clients, total AUM affected, list of incoming RMs, and any clients with pending orders/maturity dates.
- AC-004.10: Maker must confirm the preview before processing begins.
- AC-004.11: Bulk upload creates an audit log entry per row with action_type = BULK_UPLOAD.
- AC-004.12: Bulk upload results email sent to Maker AND their supervisor.
- BR-004.4: Bulk uploads are logged with full file content for regulatory audit.

This provides accountability without blocking efficiency.

**On optimistic locking/version control:**
Add a `version` INTEGER field to HandoverRequest. On every update, version increments. The authorize/reject API must include the current version in the request body. If versions don't match, return 409 Conflict: "This request has been modified since you last viewed it. Please refresh and try again."

**On notification delivery:**
Add to NFR Section 8:
- Notifications use a persistent message queue (e.g., database-backed job queue).
- Failed email deliveries are retried 3 times with exponential backoff (1 min, 5 min, 30 min).
- After 3 failures, notification is marked as FAILED in HandoverNotification with error details.
- In-app notifications are always delivered (they're database records with is_read flag).
- Daily reconciliation report of failed notifications sent to System Administrator.

**OPPONENT (pressing on architectural concerns):**

**On data archival — the elephant in the room:**
NFR Section 8.5 specifies "Audit logs: retained for 7 years per regulatory requirement." But there's no archival strategy. The HandoverAuditLog table will grow indefinitely. After 3 years of operations with 50+ handovers/month plus delegations, this table could have millions of rows. The BRD needs:
- Partition strategy (by year/quarter)
- Archival to cold storage after 2 years
- Impact on FR-012 (Handover History search) when queries span archived data
- Data retention policy for the HandoverRequest and DelegationRequest tables themselves (not just audit logs)

**On cross-branch handover limitations:**
The BRD states delegation is "limited to RMs under the same supervisor or within the same branch" (constraint in Section 2.4). But handover has no such restriction — you can hand over across branches. This creates a gap: when doing a cross-branch handover, which branch's Checker authorizes? The Maker's branch? The outgoing RM's branch? The incoming RM's branch? The authorization routing logic is unspecified.

**On the scrutiny checklist for delegation:**
FR-008 says "Scrutiny Checklist completion required for client delegations" (AC-008.3). But delegations are temporary — does it make sense to complete a full scrutiny checklist for a 2-week vacation coverage? This seems like unnecessary friction. The reference implementations (Maybank) explicitly state "Delegations are auto-authorized in the system" with no mention of scrutiny checklists for delegation. The BRD over-specifies here.

**JUDGE:**

This round surfaces three high-value findings:

1. **Data archival** is a genuine architectural gap. A 7-year retention requirement without an archival strategy is incomplete. This must be addressed in the BRD — it affects database design and query patterns.

2. **Cross-branch authorization routing** is a critical workflow gap. In a multi-branch institution, who authorizes a cross-branch handover? The BRD must specify this.

3. **Scrutiny checklist for delegation** — the Opponent makes a compelling argument. The reference implementations don't require checklists for delegation. Making delegation frictionless is part of its value proposition. I recommend: make scrutiny checklist optional for delegations (configurable per institution), not mandatory.

**Round 3 Score: Proponent 6, Opponent 8** — The Opponent uncovers genuinely impactful architectural gaps.

---

### Round 4: Evidence and Alternatives

**PROPONENT (presenting evidence from reference implementations):**

1. **Validation from production systems**: All three reference implementations (Maybank V12, HSBC V10, JBR V10) have been in production for years. They all share the same core architecture: accordion-based handover screens, Existing → Selected → Incoming RM → Save flow, and maker-checker authorization. The BRD faithfully preserves this proven UX pattern.

2. **Enhancement ROI**: The BRD adds 5 features not present in any reference implementation:
   - Dashboard (FR-010) — provides operational visibility that reference implementations lack
   - Delegation Calendar (FR-011) — visual planning tool
   - Portfolio Impact Assessment (FR-013) — AUM-aware decision making
   - Pending Activities Warning (FR-014) — risk mitigation
   - Notification System (FR-015) — proactive communication

   These represent genuine competitive differentiators for the Trust OMS platform.

3. **Phased rollout is realistic**: The 4-phase plan (MVP in 4 weeks, then 3+3+2 weeks) totaling 12 weeks is achievable because the core handover CRUD operations are structurally repetitive across Lead/Prospect/Client. Shared components (entity selection grid, incoming RM section, authorization workflow) reduce redundant work.

**OPPONENT (proposing alternatives and improvements):**

1. **Alternative: Unified handover entity instead of separate Lead/Prospect/Client flows:**
   The BRD has significant code duplication in the functional requirements. FR-001 (Lead Handover), FR-002 (Prospect Handover), and FR-003 (Client Handover) share 80% identical logic. FR-006/007/008 (delegations) similarly duplicate. Consider a unified HandoverRequest that handles all entity types through a single flow, with entity-type-specific sections (scrutiny checklist) appearing conditionally. This would reduce:
   - API endpoints from 21 to ~14
   - UI components from 6 accordion panels to 2 (Handover + Delegation) with entity type selector
   - Test cases by ~40%

2. **Alternative: Batch authorization instead of individual review:**
   FR-005 requires the Checker to authorize each handover request individually. For large-scale events (e.g., RM departure with 20+ handover requests), this is inefficient. Add a "Batch Authorize" option where the Checker can select multiple pending requests and authorize them all at once (with a single confirmation).

3. **Missing: Handover request amendment workflow:**
   Currently, if a Maker submits a handover and realizes they selected the wrong incoming RM, there's no way to amend. The Checker must reject, and the Maker must re-create. Add an "Amend" capability for PENDING requests (before authorization), which cancels the original and creates an amended version with a link to the original.

4. **Missing: Delegation early termination vs. cancellation distinction:**
   FR-009 mentions delegation cancellation, but there should be two options:
   - **Cancel** (before start_date): removes the delegation entirely
   - **Early Terminate** (after start_date, before end_date): ends the delegation early and reverts assignments immediately

**JUDGE:**

The alternatives proposed by the Opponent are well-considered:

1. **Unified entity model**: Architecturally sound but would deviate from the reference implementations' UI patterns. The accordion-per-entity-type approach is proven and intuitive for operations users. However, the backend could still use a unified data model (which the BRD already does with HandoverRequest + entity_type field). I recommend: keep the UI separate but ensure backend reuse.

2. **Batch authorization**: Excellent suggestion. High-volume handover scenarios need this. Add as FR-016.

3. **Amendment workflow**: Valid improvement. Less critical than batch authorization but reduces operational friction. Add as FR-017.

4. **Cancel vs. Early Terminate**: Good distinction. The BRD should differentiate these in the DelegationRequest status field. Add EARLY_TERMINATED as a status.

**Round 4 Score: Proponent 7, Opponent 7** — Both sides contribute constructive improvements.

---

### Round 5: Closing Arguments

**PROPONENT:**

The HAM BRD represents a comprehensive, production-validated design for relationship management handover in wealth management. Its core strengths that must be preserved:

1. **Proven UX patterns**: The accordion-based Lead/Prospect/Client structure, the Existing → Selected → Incoming RM flow, and the maker-checker authorization pattern are validated across 3 production deployments in major financial institutions.

2. **Comprehensive data model**: 9 entities with full specifications enable direct code generation. The separation of HandoverRequest/HandoverItem/ScrutinyChecklist follows proper normalization and supports flexible querying.

3. **Regulatory alignment**: Immutable audit logs, segregation of duties, scrutiny checklists, and notification tracking demonstrate compliance awareness.

4. **Enhancement layer**: Dashboard, delegation calendar, AUM impact, and pending activities warning transform this from a basic CRUD module into a strategic operations management tool.

The BRD should be approved with incorporation of the improvements surfaced in this debate.

**OPPONENT:**

The BRD is a solid foundation, but the following findings must be addressed before development:

**Critical (must-fix before development):**
1. Bulk upload must NOT bypass all controls — add preview, supervisor notification, and audit logging.
2. Concurrent handover/delegation conflict resolution must be specified.
3. Cross-branch authorization routing must be defined.
4. Version/optimistic locking must be added to HandoverRequest for maker-checker data integrity.

**High Priority (should fix before development):**
5. Data archival strategy for 7-year retention requirement.
6. Make scrutiny checklist optional for delegations (configurable).
7. Add batch authorization (FR-016) for high-volume scenarios.
8. Add delegation extension workflow.
9. Add API endpoints for RM list (for dropdown population) and request amendment.

**Medium Priority (can address during development):**
10. Notification delivery retry mechanism.
11. Dashboard caching strategy.
12. Cancel vs. Early Terminate distinction for delegations.

**JUDGE:**

Both sides have argued rigorously. The debate has surfaced 12 actionable findings that will materially improve the BRD.

The Proponent demonstrated that the BRD is structurally comprehensive and production-validated. The Opponent identified genuine gaps in compliance controls (bulk upload), conflict resolution, cross-branch workflows, and operational efficiency (batch authorization).

My final assessment: This is a strong BRD that needs targeted amendments, not a fundamental redesign.

**Round 5 Score: Proponent 7, Opponent 7** — Constructive convergence.

---

## 4. Scoring Summary

| Round | Proponent | Opponent | Rationale |
|-------|-----------|----------|-----------|
| 1 | 6 | 7 | Opponent identifies concrete gaps in compliance and conflict handling |
| 2 | 7 | 7 | Both sharpen arguments; Proponent makes good concessions |
| 3 | 6 | 8 | Opponent uncovers high-impact architectural gaps (archival, cross-branch routing) |
| 4 | 7 | 7 | Both contribute constructive alternatives and improvements |
| 5 | 7 | 7 | Constructive convergence on priorities |
| **Total** | **33** | **36** | **Opponent edges ahead on gap identification** |

---

## 5. Key Risks (Ranked)

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Bulk upload bypasses maker-checker controls | CRITICAL | Add preview step, supervisor notification, enhanced audit logging, and optional confirmation workflow |
| 2 | Concurrent handover/delegation on same entity causes data inconsistency | HIGH | Specify: handover authorization auto-cancels any active delegation for the same entity |
| 3 | Cross-branch authorization routing undefined | HIGH | Specify: authorization routes to the Checker pool at the outgoing RM's branch |
| 4 | No optimistic locking on HandoverRequest | HIGH | Add version field; authorize/reject API requires version match |
| 5 | 7-year audit data retention without archival strategy | HIGH | Add partition-by-year strategy with cold storage archival after 2 years |
| 6 | No emergency/urgent handover path | MEDIUM | Add "urgent" flag with escalation to Branch Manager if not authorized within 1 hour |
| 7 | Scrutiny checklist for delegation adds unnecessary friction | MEDIUM | Make configurable (mandatory for handover, optional for delegation) |
| 8 | No batch authorization for high-volume scenarios | MEDIUM | Add FR-016 for batch authorize/reject capability |
| 9 | Notification delivery not guaranteed | MEDIUM | Add retry mechanism with dead-letter queue and reconciliation report |
| 10 | 90-day delegation cap too restrictive | LOW | Add delegation extension workflow with supervisor approval |

---

## 6. Key Benefits (Ranked)

| # | Benefit | Impact |
|---|---------|--------|
| 1 | Production-validated design from 3 major financial institutions | Reduces implementation risk and design iteration cycles |
| 2 | Complete data model (9 entities) enables direct code generation | Accelerates development by 40-60% vs. vague specifications |
| 3 | Maker-checker authorization ensures operational integrity | Meets regulatory requirements for dual control |
| 4 | AUM impact assessment provides strategic visibility | Enables informed management decisions during RM transitions |
| 5 | Delegation with auto-expiry ensures continuous client coverage | Eliminates manual tracking of temporary assignments |
| 6 | Comprehensive audit trail meets 7-year regulatory retention | Supports compliance audits and regulatory reporting |
| 7 | Pending activities warning prevents handover-related service disruptions | Protects client experience during transitions |
| 8 | Dashboard and delegation calendar provide operational visibility | Enables proactive workforce planning |

---

## 7. Alternative Approaches

| Alternative | Pros | Cons | Recommendation |
|-------------|------|------|----------------|
| Unified entity flow (single screen with entity-type selector) | Reduces code duplication by ~40%; fewer API endpoints | Deviates from proven reference implementation UX; may confuse operations users accustomed to separate tabs | **Reject for UI; adopt for backend** — Keep accordion UI but maximize component reuse |
| Batch authorization | Handles high-volume scenarios efficiently; reduces Checker fatigue | Risk of rubber-stamping without individual review | **Adopt** — Add as FR-016 with confirmation dialog showing total count and AUM impact |
| Request amendment workflow | Reduces reject-and-recreate friction | Adds complexity to state machine; complicates audit trail | **Adopt as Phase 2** — Lower priority than core features |
| Delegation auto-conversion to handover | After N days, delegation automatically converts to permanent handover | Could create unintended permanent transfers | **Reject** — Too risky; keep delegation and handover as distinct workflows |
| Client-initiated RM change via portal | Empowers clients; reduces operations workload | Regulatory complexity; client may not understand RM capacity constraints | **Defer to Phase 3** — Currently out of scope per BRD |

---

## 8. Final Verdict

### **APPROVE WITH CONDITIONS**

The Handover & Assignment Management BRD is a well-structured, production-validated specification that covers the core domain comprehensively. It is suitable for AI-assisted development with the following mandatory conditions:

**Must address before development begins (Critical + High):**

1. **FR-004 (Bulk Upload)**: Add preview/dry-run step, supervisor notification, and enhanced audit logging. Do NOT remove the maker-checker bypass entirely (it's needed for operational efficiency) but add compensating controls.

2. **Concurrent conflict resolution**: Add business rule: "If a client has an active delegation, handover is still allowed. Upon handover authorization, any active delegation for the same entity is auto-cancelled with status = CANCELLED and reason = 'Superseded by handover #{id}'."

3. **Cross-branch authorization routing**: Add business rule: "Handover authorization is routed to the Checker pool at the outgoing RM's branch. If no Checker is available at that branch, escalate to the next-level supervisory branch."

4. **Optimistic locking**: Add `version` field to HandoverRequest. Authorize/Reject API must include version in request body. Return 409 Conflict on version mismatch.

5. **Data archival**: Add archival strategy to Section 8.5 — partition audit logs by year, archive to cold storage after 2 years, specify search behavior across archived data.

6. **Delegation scrutiny checklist**: Change from mandatory to configurable. Default: not required for delegations.

7. **FR-016 (Batch Authorization)**: Add new functional requirement for batch authorize/reject.

8. **Delegation extension**: Add delegation extension workflow (extend by up to 90 additional days with supervisor approval).

9. **Missing API endpoints**: Add endpoints for RM list (dropdown population), request amendment, and delegation extension.

---

## 9. Recommended Next Steps

1. **Incorporate the 9 mandatory conditions** into the BRD and increment to v2.0.
2. **Review updated BRD** with Operations Manager and Compliance Officer for sign-off on bulk upload controls and cross-branch routing.
3. **Create test cases** from acceptance criteria using /test-case-generator before development.
4. **Proceed to phased development** following the 4-phase plan, with Phase 1 (MVP) focusing on core handover with maker-checker.
5. **Track the 3 medium-priority items** (notification retry, dashboard caching, cancel vs. early terminate) as backlog items to address during development.
6. **Plan Phase 2 scope review** after Phase 1 completion to reassess partial handover and request amendment features.
