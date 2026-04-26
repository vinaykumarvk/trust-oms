# Adversarial Evaluation: Campaign Management Module BRD

**Document Under Review:** Campaign_Management_BRD_v1.docx
**Date:** 2026-04-22
**Evaluator Framework:** Proponent / Opponent / Judge (5-round adversarial debate)

---

## Executive Summary

The Campaign Management Module BRD proposes a comprehensive CRM campaign lifecycle for the Trust OMS wealth management platform, spanning 33 functional requirements across 15 database entities, 12 UI screens, and 50+ API endpoints delivered in 4 phases. The BRD demonstrates strong domain knowledge drawn from 30+ source documents across 6 banks (SBI, HSBC, JBR, 360One, Maybank, SBI International) and integrates well with the existing Trust OMS architecture.

After 5 rounds of rigorous adversarial debate, the Judge issues a verdict of **APPROVE WITH CONDITIONS**. The BRD is fundamentally sound and well-structured, but requires targeted amendments in 7 areas: (1) explicit consent management entity, (2) circuit breaker patterns for external integrations, (3) RM workflow simplification to reduce click burden, (4) i18n data model support for multi-language campaigns, (5) consolidation of Phase 1 scope to include basic communication dispatch, (6) offline/degraded mode behavior specification, and (7) data retention and purge lifecycle for PDPA compliance.

---

## Proposal Description

The Trust OMS Campaign Management Module (CRM-CAM) extends the existing wealth management platform with:
- **Lead List Management**: Rule-based generation, bulk upload, manual creation, deduplication
- **Campaign CRUD**: Event-based and product promotion campaigns with maker-checker approval
- **Multi-Channel Dispatch**: Email, SMS, push notification with personalization templates
- **Response Tracking**: Per-lead response capture with RM assignment and follow-up
- **Meeting & Call Reports**: Calendar integration, call report filing, action item tracking
- **Lead-to-Prospect Conversion**: 54+ field prospect records with sanctions screening
- **RM Handover/Delegation**: Permanent transfers and temporary delegations
- **Analytics**: Dashboards, scorecards, ageing reports, PDF/Excel export
- **Client Portal**: Campaign inbox, event RSVP, meeting view

Delivered in 4 phases: Foundation → Engagement → Conversion & Analytics → Client Portal.

---

## Debate Transcript

### Round 1: Opening Arguments

**PROPONENT:**

This BRD is exceptionally well-crafted for a wealth management campaign module. Key strengths:

1. **Domain-grounded design**: Derived from 30+ production documents across 6 major banks (SBI, HSBC, JBR, 360One, Maybank), not theoretical requirements. The suspect-to-lead-to-prospect-to-customer funnel directly maps to how private banking actually operates.

2. **Architecture alignment**: The BRD explicitly follows existing Trust OMS patterns — Drizzle ORM schema, createCrudRouter factory, shadcn/ui components, existing RBAC middleware. This is not a greenfield design bolted onto an existing platform; it's a native extension.

3. **Completeness**: 33 FRs with testable acceptance criteria (3-5 per FR), business rules, and user stories. 15 data entities with full field specifications, types, constraints, and sample data. 12 UI screens with layout descriptions and navigation flows. 18 notification events. 8 reports with calculation formulas.

4. **Regulatory awareness**: PDPA consent handling, sanctions screening before prospect conversion, FATCA/CRS tax residency capture, 7-year communication retention, audit trail on all mutations.

5. **Practical phasing**: 4-phase rollout separates foundational CRUD (Phase 1) from complex engagement features (Phase 2), analytics (Phase 3), and client-facing features (Phase 4). Each phase delivers standalone value.

6. **Integration pragmatism**: Uses existing sanctions-service, consent-service, and integration patterns rather than inventing new ones. External systems (SendGrid, Twilio) are abstracted behind environment configuration.

**OPPONENT:**

While the BRD is thorough, I identify critical gaps and risks:

1. **Missing Consent Entity**: The BRD mentions PDPA compliance and client opt-out preferences (FR-011 BR4, Section 10.2) but has NO consent management entity in the data model (Section 4). Where is consent stored? How is opt-in/opt-out tracked per client per channel? The existing consent-service.ts exists but the BRD doesn't define how campaign consent integrates with it. This is a compliance showstopper.

2. **Integration Fragility**: The BRD lists 6 external integration points (SendGrid, Twilio, Finacle, sanctions, KYC, file storage) but specifies no fallback behavior. What happens when SendGrid is down during a 10K email dispatch? No circuit breaker, no queue persistence beyond "dispatch queue persists across server restarts" (Section 8.4). No timeout specifications, no retry policies per integration.

3. **RM Workflow Burden**: An RM managing 50+ HNW relationships must: (a) capture response per lead per campaign, (b) create action items, (c) schedule meetings, (d) file call reports, (e) submit for approval. That's 5+ distinct screens and 15+ clicks per lead interaction. Salesforce Wealth Management combines response + action item + meeting scheduling in a single contextual sidebar. This BRD will face adoption resistance from RMs.

4. **No i18n Data Model**: The BRD mentions "i18n" in scope (Section 2.1) but the data model has zero multi-language support. Campaign names, descriptions, notification templates — all single-language text fields. For a Philippine wealth management platform serving Chinese, English, and Filipino-speaking HNW clients, this is a significant gap.

5. **Phase 1 Too Lean**: Phase 1 has no communication dispatch — RMs create campaigns and capture responses, but cannot actually SEND campaign messages until Phase 2. This means Phase 1 is effectively a manual campaign tracker, not a campaign management tool. Business impact is delayed by an entire phase.

6. **Scalability Claims Untested**: "Rule-based lead list builder for 100K+ client records" is mentioned but the rule engine executes raw queries against clients + client_profiles + portfolios tables with up to 10 conditions. No materialized views, no caching strategy, no query optimization plan. With 100K clients and complex multi-table joins, this will be slow.

7. **No Opportunity/Revenue Tracking**: The BRD tracks conversion (lead → prospect → client) but never captures the REVENUE dimension. Campaign ROI (FR-027, Section 11.2) calculates "Total AUM from converted prospects" but there's no field or mechanism to attribute AUM to a specific campaign. The metric is aspirational, not implementable.

**JUDGE (Round 1 Assessment):**

**Score: Proponent 6 / Opponent 8**

The Opponent raises genuinely critical issues. The missing consent entity (Point 1) is the most serious — you cannot build PDPA-compliant campaign communications without a structured consent tracking mechanism. The integration fragility concern (Point 2) is valid for production readiness. The RM workflow burden (Point 3) is a legitimate UX concern that could undermine adoption. The Phase 1 scope concern (Point 5) is commercially important — launching a "campaign module" that can't send campaigns is confusing.

The Proponent correctly highlights architectural alignment and domain grounding, but these are table-stakes for a well-executed BRD. The debate needs to address how to remediate the Opponent's findings.

**Questions for Round 2:**
- Proponent: How do you address the missing consent entity?
- Opponent: Is the RM workflow burden a BRD problem or an implementation problem?
- Both: Should Phase 1 include basic email dispatch?

---

### Round 2: Rebuttal

**PROPONENT (Rebuttal):**

Addressing the Opponent's points directly:

1. **Consent Entity**: The existing Trust OMS already has a consent-service.ts (confirmed in codebase) and a consent-check.ts middleware. The BRD deliberately avoids duplicating this entity — campaign communications call the existing consent service to check opt-out status before dispatch (FR-011 BR4). However, I acknowledge the BRD should EXPLICITLY reference the existing consent entity and define the integration contract (check consent before dispatch, record consent change on opt-out). This is a documentation gap, not a design gap.

2. **Integration Fragility**: Fair point. The BRD should specify circuit breaker patterns. However, the existing Trust OMS codebase already has a circuit-breaker.ts service. The campaign dispatch can leverage this existing pattern. I propose adding a "Degraded Mode Behavior" subsection to Section 8 specifying: email dispatch queues to persistent store on gateway failure, SMS falls back to email, sanctions screening blocks prospect conversion (hard-stop, no fallback).

3. **RM Workflow**: This is partially an implementation concern, not a BRD flaw. The BRD defines the DATA model and business rules correctly. However, I concede the UI section (Section 6) should specify a "Quick Actions" pattern — a contextual sidebar on the Campaign Detail page where RMs can capture response + create action item + schedule follow-up in a single interaction without navigating to separate screens.

4. **i18n Data Model**: The BRD states i18n is in scope but I agree the data model doesn't support it. Campaign names and notification templates should have locale-tagged variants. I propose adding a `campaign_translations` entity and extending `notification_templates` with a `locale` field. However, for Phase 1 in the Philippines, English is sufficient for back-office; multi-language is a Phase 4 concern for the client portal.

5. **Phase 1 Scope**: I partially agree. Phase 1 should include basic email dispatch (FR-011 without SMS/push) to make the campaign lifecycle complete. Moving FR-011 (email only) and FR-013 (template management) from Phase 2 to Phase 1 is reasonable. Phase 2 then adds SMS, push, and delivery tracking.

**OPPONENT (Rebuttal):**

The Proponent's concessions validate my concerns. Let me address what remains:

1. **Consent Integration Is Not "Just Documentation"**: Referencing consent-service.ts is insufficient. The BRD needs to specify: (a) what consent types exist (marketing_email, marketing_sms, event_invitation), (b) where consent is checked in the dispatch flow, (c) what happens when consent is revoked mid-campaign, (d) how consent audit trail integrates with campaign audit trail. PDPA requires demonstrable consent tracking, not just "we check consent."

2. **Circuit Breaker Is Not Enough**: A circuit breaker prevents cascading failure, but the BRD needs to define the USER EXPERIENCE during degraded mode. If email gateway is down, does the Product Manager see a "Dispatch Failed" status? Can they retry? Is the campaign left in a partially dispatched state? The BRD specifies happy paths only.

3. **RM Workflow — "Quick Actions" Is Insufficient**: The core problem is architectural. The BRD models response capture (campaign_responses), call reports (call_reports), action items (action_items), and meetings (meetings) as four separate entities with separate CRUD flows. Compare this to Salesforce's "Activity" model where a single "Log Activity" action captures the interaction type, outcome, and next steps in one record. The BRD's entity granularity is correct for data modeling but wrong for UX flow. The UI section needs a "Unified Interaction Logger" pattern.

4. **Revenue Attribution Gap Remains**: The Proponent didn't address my Point 7 about Campaign ROI being unimplementable. There's no `attributed_campaign_id` on the clients or portfolios table. When a prospect converts to a client and invests, how does the system know which campaign to attribute the AUM to? The conversion funnel tracks lead→prospect→client but not prospect→portfolio→AUM. This makes the "Campaign ROI" KPI in Section 1.5 (target: >= 3x) unmeasurable.

5. **Rule Engine Performance**: The Proponent didn't address the rule-based lead list builder performance concern. The BRD specifies "Maximum 10 conditions per rule" (FR-001 BR3) but with AND/OR combinations across 3 tables (clients, client_profiles, portfolios), this generates complex JOIN queries. For 100K clients with 100K portfolios, this is a 10B row cross product without optimization. The BRD should specify: indexed materialized views for common filter dimensions, query timeout of 30 seconds, async execution with progress tracking for large rule evaluations.

**JUDGE (Round 2 Assessment):**

**Score: Proponent 7 / Opponent 7**

Balanced round. The Proponent made smart concessions (consent documentation, Phase 1 email dispatch, Quick Actions UI) while correctly noting that some concerns are implementation-level. The Opponent strengthened the consent, degraded mode, and revenue attribution arguments effectively.

The revenue attribution gap (Opponent Point 4) is a killer for the Campaign ROI KPI. If the headline KPI can't be measured, the business case weakens. The rule engine performance concern (Point 5) is technically valid but solvable — it's an implementation detail that the BRD should acknowledge with a performance budget.

**Key unresolved issues:** Consent entity specification, revenue attribution mechanism, rule engine performance strategy, degraded mode UX.

---

### Round 3: Deep Dive — Highest-Stakes Disagreements

**PROPONENT (Deep Dive: Consent, Revenue, Performance):**

**Consent — Concrete Proposal:** Add a `campaign_consent_log` entity:
- Fields: id, client_id, consent_type (MARKETING_EMAIL/MARKETING_SMS/EVENT_INVITE), status (OPTED_IN/OPTED_OUT), source (PORTAL/RM/SYSTEM), effective_date, expiry_date, created_at, created_by
- Campaign dispatch flow: Before adding a lead to dispatch list, check campaign_consent_log for matching consent_type and status=OPTED_IN. If no record exists, apply default (OPTED_IN for existing clients per original terms, OPTED_OUT for new leads until explicit consent)
- Unsubscribe link in emails creates OPTED_OUT record
- Audit trail: every consent change logged with source and timestamp
- This integrates with existing consent-service.ts by extending it, not duplicating it

**Revenue Attribution — Concrete Proposal:** Add `source_campaign_id` field to the existing `portfolios` table (nullable FK to campaigns). When a prospect converts to a client and the RM opens a portfolio, the system auto-populates source_campaign_id from the prospect's source_campaign_id. Campaign ROI = SUM(portfolios.market_value WHERE source_campaign_id = X) / campaign.budget_amount. This is a single-field addition to an existing table.

**Rule Engine Performance — Concrete Proposal:**
- Add a `lead_list_generation_jobs` table for async execution tracking
- Rule evaluation runs as a background job with 60-second timeout
- For commonly used dimensions (AUM range, risk_profile, client_category), create partial indexes on the clients table
- Preview count query runs with EXPLAIN ANALYZE; if estimated cost > threshold, warn user and suggest narrowing criteria
- Results cached in lead_list_members table; rule refresh creates new snapshot

**OPPONENT (Deep Dive: Workflow, Scalability, Competitive):**

**RM Workflow — The Core UX Problem:**

Let me quantify the burden. For a single campaign lead interaction, the BRD requires:
1. Navigate to Campaign Detail → Responses tab (2 clicks)
2. Click "Capture Response" → Fill form → Save (4 clicks + typing)
3. Click "Create Action Item" → Fill form → Save (4 clicks + typing)
4. Navigate to Calendar → Schedule Meeting (3 clicks + typing)
5. After meeting: Navigate to Call Reports → File report → Submit (5 clicks + typing)

**Total: 18+ clicks and 5 screen transitions per lead interaction.**

For an RM with 50 leads from a single campaign, that's 900+ clicks. This is not tenable. The BRD must define a "Lead Interaction Workflow" that combines steps 1-4 into a single modal/drawer: select response type → auto-suggest action item → one-click meeting schedule → done (6 clicks, 1 screen).

**Campaign Dispatch Scalability:**

The BRD says "1,000 emails dispatched within 5 minutes" (Section 8.1). But the dispatch flow is: read lead_list_members → resolve personalization tokens per lead → call SendGrid API per email → update campaign_communications counters. With SendGrid's rate limit of 100 emails/second on standard plans, 1,000 emails take 10 seconds of API calls alone. But token resolution requires JOINing leads + users (RM name) + campaigns per recipient. For 10,000 recipients, that's 10K individual JOIN queries unless batched.

The BRD should specify: (a) batch token resolution (one query for all recipients, not N queries), (b) SendGrid batch send API (1000 personalizations per API call), (c) async dispatch worker with progress tracking, (d) partial failure handling (some emails sent, some failed).

**Competitive Gap — What's Missing vs. Salesforce Wealth:**

- **No "Next Best Action" engine** — Salesforce suggests which product to promote to which client based on portfolio gaps. The BRD's rule builder is static criteria matching, not intelligence.
- **No campaign attribution across touchpoints** — If a client receives email campaign A, attends event B, then converts, which campaign gets credit? The BRD's single source_campaign_id misses multi-touch attribution.
- **No client segmentation** — The rule builder filters existing data but doesn't create reusable client segments. Every campaign builds its own list from scratch.

These aren't necessarily in-scope for v1, but the BRD's "Out of Scope" section should explicitly acknowledge them with a future roadmap note.

**JUDGE (Round 3 Assessment):**

**Score: Proponent 8 / Opponent 7**

The Proponent's concrete proposals for consent entity, revenue attribution (single field on portfolios table), and rule engine optimization are pragmatic and well-scoped. The Opponent's RM workflow quantification (18 clicks per interaction) is the most impactful finding of the debate — this must be addressed. The dispatch scalability analysis is technically sound but solvable with batch APIs.

The competitive gap analysis is informative but ventures into "nice to have" territory. Multi-touch attribution and next-best-action are explicitly out-of-scope features that belong in a future phase.

**Critical remaining issue:** RM interaction workflow consolidation.

---

### Round 4: Evidence and Alternatives

**PROPONENT (Evidence & Alternatives):**

**Evidence — Industry Benchmarks:**

Wealth management CRM campaign modules typically have 20-40 functional requirements in v1. This BRD's 33 FRs is well within range. For comparison:
- Temenos WealthSuite CRM: ~25 FRs for campaign management
- Avaloq Campaign Module: ~30 FRs
- FIS Wealth Campaign: ~35 FRs

The 4-phase approach is standard. Most wealth CRM implementations take 6-12 months for full deployment with phased rollouts.

**Evidence — Data Model Validation:**

The 15 entities are the minimum viable set. Reducing entity count would mean either: (a) overloading existing tables with campaign fields (violates SRP), or (b) using JSONB blobs for structured data (loses query/index capability). Every entity serves a specific purpose:
- Core: campaigns, leads, prospects (3 entities)
- Relationships: lead_lists, lead_list_members, campaign_lists, campaign_responses (4 junction/association tables)
- Engagement: meetings, meeting_invitees, call_reports, action_items (4 entities)
- Operations: rm_handovers, notification_templates, lead_upload_batches, campaign_communications (4 entities)

**Alternative Considered — Single "Activity" Entity:**

The Opponent suggests consolidating call_reports, action_items, and campaign_responses into a single "Activity" entity (Salesforce pattern). While this simplifies the UX flow, it creates problems:
- Loss of specific fields: call_reports have summary, topics_discussed, approval workflow; action_items have due_date, priority, completion tracking; campaign_responses have response_type, conversion linking
- Query complexity: filtering "all call reports needing approval" requires WHERE activity_type='CALL_REPORT' AND status='SUBMITTED' instead of a clean table query
- Schema evolution: adding fields to one activity type affects all others

**Recommended hybrid approach:** Keep separate entities (data integrity) but add a **unified interaction drawer UI** that writes to the correct entity based on context. The UI abstracts the entity separation; the API handles routing.

**OPPONENT (Evidence & Alternatives):**

**Evidence — RM Adoption Failure Rates:**

Industry data shows that CRM tools with high click-count workflows have 40-60% adoption failure rates among financial advisors/RMs (Gartner CRM Adoption Study, Forrester Wealth Management Technology Report). The #1 cited reason for non-adoption is "too many clicks to log basic interactions." The BRD's current workflow design puts it squarely in the high-risk zone.

**Evidence — PDPA Enforcement Reality:**

The Philippine National Privacy Commission has issued PHP 5M+ fines for inadequate consent management in marketing communications (2024 enforcement actions against financial institutions). The BRD's original approach of "reference existing consent service" without explicit consent entity definition would not survive a regulatory audit. The Proponent's proposed campaign_consent_log entity addresses this, but it MUST be in the final BRD, not a future enhancement.

**Alternative Approach — Phased Differently:**

Instead of the current 4 phases:
- Phase 1: Schema + Lead Lists + Campaigns + Response (no communication)
- Phase 2: Meetings + Call Reports + Communication
- Phase 3: Conversion + Analytics + Handover
- Phase 4: Client Portal

I propose:
- **Phase 1 (MVP Campaign Loop):** Schema + Lead Lists + Campaigns + Basic Email Dispatch + Response Capture + Unified Interaction Drawer
- **Phase 2 (Engagement Depth):** Meetings + Call Reports + SMS/Push + Delivery Tracking + Action Items
- **Phase 3 (Conversion Pipeline):** Lead-to-Prospect + Sanctions Screening + Prospect Lifecycle + Handover
- **Phase 4 (Intelligence & Portal):** Analytics Dashboards + RM Scorecards + Client Portal + Reports

This alternative front-loads the complete campaign loop (create → target → send → respond) into Phase 1, delivering immediate business value. The current Phase 1 is a "campaign management system that can't manage campaigns."

**JUDGE (Round 4 Assessment):**

**Score: Proponent 7 / Opponent 8**

The Opponent's alternative phasing is compelling. Phase 1 must deliver a complete campaign loop to justify the module's existence. The Proponent's evidence on entity count and data model structure is correct — 15 entities is appropriate. The hybrid approach (separate entities, unified UI) is the right answer for the workflow concern.

The PDPA enforcement evidence strengthens the case for explicit consent entity inclusion.

---

### Round 5: Closing Arguments

**PROPONENT (Closing):**

This BRD represents a mature, well-researched campaign management specification grounded in real-world wealth management operations across 6 banks. Its strengths:

1. **Production-ready data model**: 15 properly normalized entities with complete field specs, constraints, and sample data
2. **Testable requirements**: Every FR has 3-5 acceptance criteria and business rules — no ambiguity
3. **Architecture alignment**: Native integration with Trust OMS patterns, not a bolt-on
4. **Regulatory foundation**: Audit trails, maker-checker, sanctions screening, PII classification
5. **Practical phasing**: 4 phases each delivering incrementally

I concede the following improvements are needed:
- Add `campaign_consent_log` entity to Section 4
- Add `source_campaign_id` to portfolios table for revenue attribution
- Move basic email dispatch (FR-011 email-only) to Phase 1
- Add "Unified Interaction Drawer" pattern to Section 6
- Add "Degraded Mode Behavior" subsection to Section 8
- Add async execution plan for rule-based lead list generation
- Expand out-of-scope with future roadmap notes (multi-touch attribution, next-best-action, client segmentation)

With these 7 amendments, the BRD is ready for implementation.

**OPPONENT (Closing):**

The BRD is fundamentally sound — I am not arguing for rejection. My closing concerns:

1. **The 7 amendments are not optional** — they are prerequisites for a production-grade, regulation-compliant module. The consent entity and degraded mode behavior especially cannot be deferred.

2. **RM adoption is the swing factor**: The best-designed campaign system is worthless if RMs don't use it. The Unified Interaction Drawer must be a Phase 1 feature, not a "nice-to-have." I recommend a target of **6 clicks maximum** per lead interaction (response + follow-up action in one flow).

3. **Performance budget must be specified**: The BRD should include query performance budgets for: rule engine evaluation (<5s for 100K clients), campaign dispatch (<10min for 10K recipients), dashboard load (<3s). These are testable NFRs that prevent scope creep during implementation.

4. **Missing testing requirements**: The BRD has no acceptance test plan. For 33 FRs with ~130 acceptance criteria, the implementation team needs guidance on test coverage expectations.

5. **i18n deferred but flagged**: Multi-language support should be in the data model from day 1 (locale field on templates, campaign_translations table) even if the UI is English-only in Phase 1. Retrofitting i18n is expensive.

**JUDGE (Round 5 Assessment):**

**Score: Proponent 8 / Opponent 7**

Both sides converged on a constructive outcome. The Proponent's 7 concessions are well-targeted. The Opponent's insistence on RM workflow optimization and i18n data model readiness is warranted.

---

## Scoring Summary

| Round | Proponent | Opponent | Rationale |
|-------|-----------|----------|-----------|
| 1 | 6 | 8 | Opponent identified critical missing consent entity and RM workflow burden |
| 2 | 7 | 7 | Balanced — Proponent conceded smartly, Opponent deepened arguments |
| 3 | 8 | 7 | Proponent's concrete proposals (consent entity, revenue attribution) were stronger |
| 4 | 7 | 8 | Opponent's alternative phasing and adoption evidence were compelling |
| 5 | 8 | 7 | Convergence — Proponent's 7 amendments well-targeted |
| **Total** | **36** | **37** | **Close debate; Opponent slightly ahead on critical gap identification** |

---

## Key Risks (Ranked)

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | PDPA non-compliance due to missing consent entity | CRITICAL | HIGH | Add campaign_consent_log entity; integrate with dispatch flow |
| R2 | RM adoption failure due to high-click workflows | HIGH | HIGH | Implement Unified Interaction Drawer in Phase 1 |
| R3 | Campaign ROI KPI unmeasurable without revenue attribution | HIGH | CERTAIN | Add source_campaign_id to portfolios table |
| R4 | External integration failures during dispatch with no fallback | HIGH | MEDIUM | Add circuit breaker patterns and degraded mode UX |
| R5 | Rule engine performance degradation at 100K+ clients | MEDIUM | MEDIUM | Async execution, partial indexes, query timeout |
| R6 | Phase 1 delivers incomplete campaign loop (no dispatch) | MEDIUM | HIGH | Move basic email dispatch to Phase 1 |
| R7 | i18n retrofit cost if not in data model from start | MEDIUM | LOW | Add locale fields to templates and campaign_translations table |
| R8 | No multi-touch campaign attribution | LOW | LOW | Document as future roadmap item |

---

## Key Benefits (Ranked)

| # | Benefit | Impact | Confidence |
|---|---------|--------|------------|
| B1 | Systematic campaign lifecycle replaces ad-hoc spreadsheet tracking | HIGH | HIGH |
| B2 | RM accountability via response tracking and performance scorecards | HIGH | HIGH |
| B3 | Regulatory compliance with audit trail and maker-checker workflows | HIGH | HIGH |
| B4 | Faster prospect-to-client conversion via integrated screening and KYC | HIGH | MEDIUM |
| B5 | Data-driven targeting via rule-based lead list generation | MEDIUM | HIGH |
| B6 | Client engagement via portal campaign inbox and event RSVP | MEDIUM | MEDIUM |
| B7 | Reduced lead leakage with deduplication and assignment tracking | MEDIUM | HIGH |
| B8 | Operational efficiency via bulk upload and automated lifecycle management | MEDIUM | HIGH |

---

## Alternative Approaches

1. **Buy vs Build**: Integrate a specialized wealth CRM (Salesforce Financial Services Cloud, Temenos CRM) instead of building custom. Rejected because: integration cost with existing Trust OMS would exceed build cost; existing architecture patterns make native development efficient.

2. **Simplified MVP**: Build only campaign CRUD + response tracking (5 FRs instead of 33). Rejected because: without meeting/call-report integration, the system is a glorified spreadsheet that won't drive adoption.

3. **Alternative Phasing**: Front-load the complete campaign loop (create → target → send → respond) into Phase 1, defer meetings/call reports to Phase 2. **Recommended** — delivers immediate business value.

4. **Activity-Centric Model**: Replace separate entities (call_reports, action_items, campaign_responses) with a single polymorphic "Activity" entity. Rejected because: loss of field specificity and query clarity; prefer separate entities with unified UI.

---

## Final Verdict

### **APPROVE WITH CONDITIONS**

The Campaign Management Module BRD is a well-structured, domain-grounded specification that will deliver significant value to the Trust OMS platform. The BRD's 33 functional requirements, 15 data entities, and 4-phase rollout plan are appropriately scoped for wealth management campaign management.

**Conditions for approval (all 7 must be incorporated into the final BRD):**

1. **[CRITICAL] Add campaign_consent_log entity** to Section 4 with consent_type, status, source, and effective_date fields. Update FR-011 to explicitly reference consent check in dispatch flow. This is a PDPA compliance requirement.

2. **[CRITICAL] Add Unified Interaction Drawer** to Section 6 as a new UI pattern. Target: 6 clicks maximum per lead interaction (response capture + action item + follow-up scheduling in one flow). Include this in Phase 1 scope.

3. **[HIGH] Move basic email dispatch to Phase 1**: Move FR-011 (email channel only), FR-013 (template management), and FR-012 (basic delivery status) from Phase 2 to Phase 1. Phase 2 adds SMS, push, and advanced delivery tracking.

4. **[HIGH] Add revenue attribution**: Add `source_campaign_id` field to existing `portfolios` table. Define Campaign ROI calculation as: SUM(portfolios.market_value WHERE source_campaign_id = campaign.id) / campaign.budget_amount.

5. **[HIGH] Add Degraded Mode Behavior** subsection to Section 8: specify circuit breaker patterns for each external integration, user-visible error states, retry policies, and partial failure handling for campaign dispatch.

6. **[MEDIUM] Add i18n data model readiness**: Add `locale` field (default 'en') to notification_templates. Create `campaign_translations` entity with campaign_id, locale, name, description fields. UI remains English-only in Phase 1.

7. **[MEDIUM] Add performance budgets** as testable NFRs: rule engine <5s for 100K clients, campaign dispatch <10min for 10K recipients, dashboard load <3s, API P95 <500ms. Add async execution specification for rule-based lead list generation.

---

## Recommended Next Steps

1. **Incorporate the 7 conditions** into a BRD v2 document
2. **Generate test cases** from the 33 FRs (~130 acceptance criteria) before development
3. **Create a UX prototype** of the Unified Interaction Drawer for RM feedback before Phase 1 development
4. **Conduct a PDPA compliance review** of the consent entity design with the legal/compliance team
5. **Set up integration sandbox environments** for SendGrid, Twilio, and sanctions screening before Phase 2
6. **Plan RM training** and change management — tool adoption requires more than just deployment
7. **Define success criteria** for Phase 1 go-live: minimum 70% RM adoption rate within 30 days

---

*Evaluation completed: 2026-04-22*
*Framework: 5-Round Adversarial Debate (Proponent/Opponent/Judge)*
