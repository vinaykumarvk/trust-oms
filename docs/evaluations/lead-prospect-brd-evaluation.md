# Adversarial Evaluation — Lead & Prospect Management BRD

**Date**: 2026-04-22
**Document Evaluated**: `docs/LeadProspect_BRD_FINAL.docx`
**Evaluator**: Claude Code — Adversarial Idea Evaluator

---

## 1. Executive Summary

The Lead & Prospect Management BRD for Trust OMS proposes a comprehensive 10-module CRM system tailored for wealth management institutions. The document is exceptionally thorough — 27 data entities, 37 functional requirements, 60+ API endpoints, and a 4-phase rollout plan. After five rounds of adversarial debate, the Judge finds the proposal **Approved with Conditions**. The BRD's strengths lie in its wealth-management specificity, detailed data models, and realistic phased delivery. However, critical gaps in data privacy regulation compliance (GDPR/PDPA), the duplicated lead/prospect schema design, absence of consent management, and unrealistic performance targets for fuzzy matching need resolution before implementation begins.

---

## 2. Proposal Description

The BRD proposes building a Lead & Prospect Management module within an existing Trust OMS platform. The module digitizes the full suspect → lead → prospect → customer lifecycle for private banking relationship managers. It encompasses 10 sub-modules: Lead Management, Lead List Management & Rule Engine, Campaign Management, Prospect Management, Conversion Flows, Calendar/Meeting Management, Call Report Management, Handover & Delegation, Service Request Management, and Task Management. The target stack is React + Express + PostgreSQL + Drizzle ORM, integrating with an existing back-office application. The rollout is planned across 4 phases.

---

## 3. Debate Transcript

### Round 1: Opening Arguments

**Proponent:**

This BRD is one of the most complete requirements documents for a wealth management CRM module I've seen. Key strengths:

1. **Domain-specific depth**: Unlike generic CRM BRDs, this one speaks the language of wealth management — AUM-based classification, trust product types (IMA, PMT, UITF), PEP flagging, negative/blacklist screening, and multi-level RM hierarchies. It was clearly informed by real implementation documents from 5 major institutions (HSBC, SBI, 360One, JBR, Maybank).

2. **Complete data model**: 27 entities with every field specified including types, validations, defaults, and sample data. An AI builder could generate the entire schema from Section 4 alone. The use of JSONB for flexible structures (criteria_json, action_items) is pragmatic.

3. **Exhaustive permissions matrix**: The 8-role × 32-action matrix in Section 3 leaves no ambiguity about who can do what. This alone prevents weeks of back-and-forth during implementation.

4. **Realistic phasing**: Four phases from Foundation through Operations/Governance is sensible. Phase 1 focuses on the core CRUD + compliance checks, which delivers immediate value.

5. **Traceable requirements**: 37 numbered FRs, each with user stories, acceptance criteria, and business rules. This enables direct test case generation.

6. **Integration-aware**: Explicitly states it must follow existing schema.ts patterns, role-auth middleware, and httpOnly cookie auth. This isn't a greenfield fantasy — it respects the existing codebase.

**Opponent:**

While the BRD is voluminous, volume does not equal quality. I identify several critical weaknesses:

1. **Massive data duplication — leads and prospects tables are nearly identical**: The BRD defines `leads` (40+ fields) and `prospects` (45+ fields) as separate tables with ~90% field overlap. Additionally, each has 5 sub-tables (family, addresses, identifications, lifestyle, documents) that are explicitly "identical in structure." This means 12 near-duplicate tables. This is a maintenance nightmare. When a validation rule changes on `first_name`, you must update it in both `leads` and `prospects` plus all sub-tables. A single `contacts` table with a `stage` enum (LEAD, PROSPECT, CUSTOMER) would be far cleaner.

2. **No data privacy/consent management**: The BRD handles PII extensively (names, phones, emails, DOBs, ID numbers) but never mentions GDPR, PDPA (Philippines), India's DPDP Act, or any data privacy regulation. There is no consent capture, no data retention policy, no right-to-erasure workflow, no data portability. For a system handling HNI PII across multiple jurisdictions (India, Philippines, Malaysia, Hong Kong — per the reference documents), this is a critical compliance gap.

3. **Fuzzy matching performance claim is unrealistic**: FR-004 specifies Levenshtein distance ≤ 2 for name matching against the negative list, and NFR 8.1 demands this complete within 2 seconds against 500K records. Levenshtein distance computation is O(n*m) per comparison. Against 500K records with no indexing strategy specified, this will take minutes, not seconds. The BRD provides no guidance on how to achieve this (trigram indexes, pg_trgm extension, pre-computed phonetic codes, etc.).

4. **Campaign email/SMS dispatch is dangerously underspecified**: FR-014 says "system sends email to all leads in target list." For a campaign with 10,000+ leads, this needs: bounce handling, delivery tracking, open/click tracking, unsubscribe processing, suppression lists, CAN-SPAM/PDPA compliance, sender reputation management. The BRD mentions "include unsubscribe link" as a one-liner business rule but has no entity or workflow for managing unsubscribes.

5. **The scope is enormous for a single BRD**: 10 modules, 37 FRs, 27 entities, 60+ endpoints. This is 6-12 months of development for a team. Lumping Calendar, Call Reports, Service Requests, and Task Management into the same BRD as Lead/Prospect Management dilutes focus. These should be separate BRDs with their own evaluation cycles.

**Judge:**

Both sides present compelling arguments. The Proponent correctly identifies the BRD's exceptional structural quality — it is one of the most systematically organized requirements documents possible, with traceable FRs, complete data models, and realistic phasing. The Opponent, however, raises genuinely critical issues. The data duplication concern is architecturally significant. The privacy gap is a potential regulatory blocker. The fuzzy matching performance claim needs substantiation.

**Round 1 Score: Proponent 6/10, Opponent 7/10.** The Opponent's structural and compliance criticisms carry more weight because they affect the viability of the solution, not just its documentation quality.

---

### Round 2: Rebuttal

**Proponent (addressing Opponent's Round 1):**

1. **On data duplication**: The separate leads/prospects tables are a deliberate domain modeling choice, not an oversight. In the reference implementations (HSBC, SBI, 360One), leads and prospects have *different* lifecycles, *different* dedupe rules, *different* permission models, and *different* conversion workflows. A unified `contacts` table with a stage enum would require: complex state machine logic mixing two lifecycles, conditional validations that change by stage, joins that always filter by stage, and migration complexity when a lead "becomes" a prospect (do you update in place, losing lead history, or copy?). The BRD's approach — copy on conversion — preserves full lead history while giving prospects their own independent lifecycle. This is a trade-off, not a flaw.

2. **On data privacy**: The BRD explicitly includes PII encryption at rest (NFR 8.2), soft delete (all entities), and audit trails. The absence of GDPR/PDPA-specific workflows is a valid gap, but the BRD's scope is "Lead & Prospect Management," not "Data Privacy Compliance." A separate Data Privacy addendum should cover consent management, retention policies, and erasure workflows. The existing Trust OMS likely has (or should have) a platform-level privacy framework.

3. **On fuzzy matching**: The 2-second target is for single-record operations (creating one lead), not bulk scanning. PostgreSQL's `pg_trgm` extension with GIN/GiST indexes can perform fuzzy text search against 500K records in under 100ms. The BRD's performance target is achievable with proper indexing — implementation details belong in a technical design document, not a BRD.

4. **On email dispatch**: The BRD correctly identifies this as an internal capability using SendGrid/Twilio. These services handle bounce management, delivery tracking, and reputation management at the platform level. The BRD's role is to specify *what* to send, *when*, and *to whom* — not to re-specify SendGrid's feature set.

**Opponent (addressing Proponent's rebuttal):**

1. **On data duplication rebuttal**: The "deliberate choice" argument doesn't hold. The different lifecycles can be modeled with a single state machine (SUSPECT → LEAD → QUALIFIED → PROSPECT → RECOMMENDED → CUSTOMER). Different dedupe rules already reference `entity_type` in the `dedupe_rules` table — this works equally well with a `stage` field. Different permissions can filter by stage. The copy-on-conversion approach *already exists* in the BRD (FR-023: "All lead data auto-copied to prospect form") — it just creates the copy in a separate table instead of advancing the stage. This means every name update, every phone correction, every address change must be maintained in parallel if someone needs to update a prospect's data that was originally captured in the lead phase. The 12-table duplication is an architectural debt that compounds over the life of the system.

2. **On data privacy rebuttal**: "A separate addendum should cover it" is exactly the problem. You cannot design a PII-heavy system and defer privacy to an addendum. The data model itself must be privacy-aware from day one: which fields require consent? What's the retention period for dropped leads (GDPR requires deletion, not just soft-delete)? Can a prospect exercise the right to be forgotten? The soft-delete pattern (deleted_at) is actually *anti-GDPR* because it retains PII. These decisions affect schema design, not just policy documents.

3. **On fuzzy matching rebuttal**: If pg_trgm is the answer, the BRD should specify it as a technical constraint or assumption. "Implementation details belong in a technical design document" is valid for *how* to index, but the BRD should acknowledge the dependency: "Negative list screening requires PostgreSQL pg_trgm extension for fuzzy matching." Without this, an implementer might build a naive loop and discover the performance gap only in production.

4. **On email dispatch rebuttal**: SendGrid handles delivery mechanics, but the *business logic* of unsubscribe management is the BRD's responsibility. Where is the `communication_preferences` table? When a lead replies STOP, which entity tracks that? How does the system prevent re-sending to an unsubscribed lead if they appear in a new campaign list? This is business logic, not platform mechanics.

**Judge:**

Strong exchanges on both sides. On data duplication: the Proponent's domain-modeling argument has merit in wealth management where lead-vs-prospect is a real business distinction, but the Opponent's maintenance cost concern is valid. This is a legitimate architectural trade-off, not a clear win for either side. On data privacy: the Opponent wins this point decisively — privacy-by-design is a regulatory requirement, not an optional addendum. On fuzzy matching: the Proponent's pg_trgm point is technically correct, but the Opponent is right that the BRD should mention it as a dependency. On email/unsubscribe: the Opponent wins — unsubscribe state is business logic that needs a data model.

**Round 2 Score: Proponent 7/10, Opponent 7/10.** Even exchange. Both sides strengthened their positions.

---

### Round 3: Deep Dive — Highest-Stakes Disagreements

**Proponent (focusing on the BRD's greatest strengths under pressure):**

Let me address the deepest concern — **is this BRD implementable as written?** — by stress-testing the three highest-risk modules:

1. **Lead Rule Engine (FR-008/009)**: The criteria_json JSONB structure with recursive groups, AND/OR/NOT logic, and mathematical operators is well-specified. The supported fields list (total_aum, age, client_segment, etc.) maps to existing `clients` table columns. A PostgreSQL function that dynamically builds a WHERE clause from the JSON tree is a well-understood pattern (similar to Drizzle's `where()` builder). The 10-second target for generating a list from 100K clients is generous. This module is straightforward to implement.

2. **Campaign Communication (FR-014)**: The scheduled job pattern (daily at 06:00, check for campaigns reaching start_date) is simple cron/node-cron. Template substitution ({{lead_name}}, {{rm_name}}) is basic string replacement. The rate limiting (100 emails/min) is conservative. The retry logic (3 times with exponential backoff) is standard. This is a low-risk module.

3. **Handover & Delegation (FR-033/034)**: The maker-checker pattern already exists in the Trust OMS codebase (GL authorization). The rm_handovers entity cleanly models both permanent (HANDOVER) and temporary (DELEGATION) with a shared table. The auto-expiry for delegation is a scheduled job checking end_date. The rm_history table provides a clean audit trail. This builds on existing patterns.

**The BRD is implementable because it stays within known patterns**: CRUD + status lifecycles + scheduled jobs + maker-checker. There are no novel algorithms, no external API dependencies (beyond email/SMS), and no real-time requirements.

**Opponent (focusing on the deepest implementation risks):**

1. **The "Related Entity" Polymorphic Pattern is a Trap**: Multiple entities use `related_entity_type` + `related_entity_id` for polymorphic references (meetings, call_reports, tasks, service_requests, opportunities). This pattern cannot use foreign key constraints, breaks referential integrity, prevents JOINs without conditional logic, and creates N+1 query problems. In a system with 27 entities and 60+ endpoints, this will lead to data integrity issues and slow queries. The proper solution is join tables or separate FK columns.

2. **No Concurrent Edit / Optimistic Locking Strategy**: With 200+ RMs potentially modifying leads and prospects simultaneously, there's no specification for handling concurrent edits. No `version` column, no `If-Match` headers, no last-write-wins vs. optimistic locking decision. In wealth management, where a single prospect may represent millions in AUM, data accuracy is critical. Two RMs updating the same prospect's AUM estimate could silently overwrite each other.

3. **The Notification System is a Hidden Monster**: Section 10 lists 20 notification types across in-app, email, and SMS channels. This is effectively a notification microservice. Who owns the notification queue? What happens when the email gateway is down during a campaign dispatch? The BRD treats notifications as a flat table insert but the delivery infrastructure (queue processing, retry, dead letter, user preference filtering) is substantial. The notifications entity has no status field for delivery tracking.

4. **Bulk Upload Error Handling is Incomplete**: FR-010 and FR-022 specify bulk upload with validation and error logs. But what about partial failures mid-processing? If record 5,000 of 10,000 fails due to a database connection timeout, do the first 4,999 records commit or rollback? The BRD says nothing about transaction boundaries for bulk operations. In financial systems, partial commits without clear status reporting are dangerous.

**Judge:**

Round 3 reveals implementation-level risks that a BRD *should* address. The Proponent correctly argues that the core patterns (CRUD, status machines, cron jobs, maker-checker) are well-understood and implementable. However, the Opponent identifies four real technical risks:

- The polymorphic reference pattern (related_entity_type/id) is a known anti-pattern in relational databases. This is a valid criticism that affects data integrity.
- Concurrent edit handling is a genuine gap for a multi-user system.
- The notification system complexity is underestimated.
- Bulk upload transaction boundaries need specification.

**Round 3 Score: Proponent 6/10, Opponent 8/10.** The Opponent found concrete, high-impact technical gaps that could cause real production issues.

---

### Round 4: Evidence and Alternatives

**Proponent (presenting evidence and addressing technical gaps):**

1. **On polymorphic references**: The Trust OMS codebase *already uses this pattern* (audit_records references multiple entity types). Drizzle ORM supports dynamic joins. While not ideal, refactoring to join tables for 5 entities × 3 entity types = 15 join tables adds significant schema complexity. The pragmatic approach: use polymorphic references with application-level integrity checks and compound indexes on (related_entity_type, related_entity_id).

2. **On concurrent editing**: Adding `version INTEGER DEFAULT 1` to leads and prospects tables and using optimistic locking with 409 Conflict responses is a 2-day implementation. This is a valid gap but easily addressed without changing the BRD's architecture. Recommendation: add as an NFR.

3. **On notifications**: The BRD specifies "In-app notification" as the primary channel (inserts into notifications table). Email/SMS dispatch piggybacks on the same SendGrid/Twilio infrastructure used for campaigns. A simple job queue (pg-boss or Bull) processes outbound notifications. Adding a `delivery_status` column (PENDING, SENT, FAILED) to the notifications table resolves tracking.

4. **On bulk upload transactions**: Standard approach: process in batches of 100 within transactions. Commit per batch. Upload_logs tracks progress. If batch 51 fails, batches 1-50 are committed, batch 51's errors are logged, and processing continues with batch 52. This is the industry standard for bulk financial data imports.

**Opponent (proposing concrete alternatives):**

Let me propose **five specific improvements** that would make this BRD significantly stronger:

1. **Unified Contact Model Alternative**: Replace the 12 lead/prospect parallel tables with a single `contacts` table + stage enum. Add `stage_history` table for tracking transitions. Use views (`leads_view`, `prospects_view`) that filter by stage for backward-compatible API. This reduces the schema from 12 tables to 7 and eliminates copy-on-conversion entirely. The lead-to-prospect "conversion" becomes a simple stage update.

2. **Add a `communication_preferences` table**: Fields: contact_id, channel (EMAIL/SMS/PHONE), is_opted_in, opted_out_date, opt_out_source, consent_date, consent_source. This resolves the unsubscribe gap and provides GDPR/PDPA consent tracking.

3. **Add a `data_retention_policies` table**: Defines retention period per entity type and status (e.g., DROPPED leads deleted after 2 years, DO_NOT_CONTACT leads anonymized immediately). A scheduled job enforces retention. This is essential for regulatory compliance.

4. **Replace polymorphic references with explicit FKs**: For `call_reports`, replace `related_entity_type/id` with `lead_id UUID NULL, prospect_id UUID NULL, client_id UUID NULL` with a CHECK constraint ensuring exactly one is non-null. This preserves referential integrity and enables efficient JOINs.

5. **Add NFRs for concurrent edit handling and bulk transaction boundaries**: As the Proponent suggested, add `version` columns for optimistic locking and specify batch-commit semantics for uploads.

**Judge:**

The Opponent's five concrete improvements are all valid and would materially strengthen the BRD. The Proponent's rebuttals on each point are technically sound (polymorphic references work, batched commits are standard) but represent *pragmatic compromises* rather than *best practices*.

The unified contact model debate is the most interesting. Both approaches have merit. The separate tables approach is used by the reference implementations (Intellect Wealth Qube). The unified approach is cleaner from a software engineering perspective. For a wealth management system with regulatory audit requirements, the separate tables approach may actually be preferable because it creates an immutable record of the lead stage (the lead record is never modified after conversion). This is a legitimate architectural choice.

**Round 4 Score: Proponent 7/10, Opponent 8/10.** The Opponent's concrete improvement proposals give actionable value beyond criticism.

---

### Round 5: Closing Arguments

**Proponent:**

This BRD represents the highest-quality requirements specification for a wealth management CRM module that one could reasonably produce. Its strengths are:

1. **Complete traceability**: Every FR has an ID, user story, acceptance criteria, and business rules. Test cases can be derived mechanically.
2. **Domain authenticity**: Built from 5 real-world implementation references (HSBC, SBI, 360One, JBR, Maybank), not theoretical assumptions.
3. **Integration realism**: Respects the existing Trust OMS architecture, stack, and patterns.
4. **Implementable scope per phase**: Each phase delivers independent business value (Phase 1 alone gives lead/prospect CRUD + compliance checks).
5. **Clear boundaries**: Out-of-scope items are explicitly stated, preventing scope creep.

The gaps identified — data privacy addendum, communication preferences, optimistic locking, notification delivery tracking — are all addressable with a BRD revision that adds ~5 pages. They do not invalidate the architecture or require rethinking the approach. The core design is sound.

**Opponent:**

The BRD is a strong foundation but has five categories of gaps that must be addressed before implementation:

1. **Privacy & Consent (Critical)**: No consent capture, no retention policies, no right-to-erasure, no anonymization. This is a legal blocker in GDPR, PDPA, and DPDP jurisdictions.
2. **Data Architecture (Important)**: The 12-table duplication creates long-term maintenance debt. At minimum, add a migration strategy note.
3. **Technical Gaps (Important)**: Polymorphic references, no optimistic locking, no bulk transaction boundaries, no fuzzy matching strategy.
4. **Communication Management (Important)**: No unsubscribe/preference tracking entity or workflow.
5. **Scope Management (Advisory)**: 10 modules is ambitious. Consider splitting Calendar/Call Reports/Tasks into a separate "RM Productivity" BRD.

The BRD should not be rejected — it is fundamentally sound. But it should not be approved without conditions addressing items 1, 2, and 4.

**Judge:**

Both sides have argued well across five rounds. The BRD is impressively comprehensive in its functional specification, data modeling, and domain expertise. It would enable a competent engineering team to build the system with minimal ambiguity. However, the Opponent has identified genuine gaps — particularly in data privacy, communication preferences, and certain technical specifications — that represent real risk.

**Round 5 Score: Proponent 7/10, Opponent 7/10.** Both sides finish strong with clear, substantive arguments.

---

## 4. Scoring Summary

| Round | Proponent | Opponent | Topic |
|-------|-----------|----------|-------|
| 1 | 6 | 7 | Opening: strengths vs. structural gaps |
| 2 | 7 | 7 | Rebuttal: domain modeling vs. privacy-by-design |
| 3 | 6 | 8 | Deep dive: implementability vs. technical risks |
| 4 | 7 | 8 | Evidence: pragmatic compromises vs. concrete improvements |
| 5 | 7 | 7 | Closing: sound foundation vs. conditional approval |
| **Total** | **33** | **37** | **Opponent wins on points** |

---

## 5. Key Risks (Ranked)

| # | Risk | Severity | Likelihood | Impact |
|---|------|----------|------------|--------|
| R1 | **Data privacy non-compliance** — No consent capture, retention policy, or right-to-erasure for HNI PII across multiple jurisdictions | Critical | High | Regulatory penalties, legal liability |
| R2 | **Schema maintenance burden** — 12 near-duplicate tables (lead + prospect × 6 sub-tables) require parallel maintenance | High | High | Tech debt accumulation, inconsistency bugs |
| R3 | **Unsubscribe/preference gap** — No entity or workflow for managing communication opt-outs | High | High | Anti-spam regulation violation, reputation damage |
| R4 | **Concurrent edit data loss** — No optimistic locking for multi-user lead/prospect editing | Medium | Medium | Silent data overwrite in high-value records |
| R5 | **Polymorphic reference integrity** — No FK constraints on related_entity_type/id columns | Medium | Medium | Orphaned references, query complexity |
| R6 | **Bulk upload partial failure** — No transaction boundary specification for large imports | Medium | Low | Inconsistent data state after upload errors |
| R7 | **Notification system underestimation** — 20 notification types without delivery tracking or queue specification | Medium | Medium | Missed notifications, no delivery visibility |
| R8 | **Fuzzy matching performance** — Levenshtein on 500K records without specified indexing strategy | Low | Medium | Slow negative list screening in production |
| R9 | **Scope overload** — 10 modules in one BRD may dilute focus during implementation | Low | Medium | Schedule risk, team overextension |

---

## 6. Key Benefits (Ranked)

| # | Benefit | Impact |
|---|---------|--------|
| B1 | **Complete lead-to-customer journey** digitization replacing manual/spreadsheet processes | Transformational |
| B2 | **Regulatory compliance built-in**: dedupe, blacklist screening, PEP flagging, audit trails | Critical for compliance |
| B3 | **Campaign-driven lead generation** with rule engine targeting existing customer base | Revenue growth driver |
| B4 | **RM productivity**: unified workspace with leads, prospects, meetings, tasks, pipeline | Operational efficiency |
| B5 | **Management visibility**: campaign ROI, conversion funnel, RM productivity dashboards | Data-driven decisions |
| B6 | **Operational governance**: maker-checker for handover, campaign approval, call report approval | Risk management |
| B7 | **Integration with existing Trust OMS**: no separate system, shared auth/schema/patterns | Lower TCO |
| B8 | **Phased delivery**: each phase independently valuable; Phase 1 alone useful | Reduced delivery risk |
| B9 | **Wealth-management specificity**: AUM classification, trust product types, multi-currency TRV | Domain fit |
| B10 | **Complete data model**: 27 entities with field-level specs enabling direct schema generation | Faster implementation |

---

## 7. Alternative Approaches

| # | Alternative | Pros | Cons |
|---|-------------|------|------|
| A1 | **Unified Contact Model** — Single `contacts` table with stage enum instead of separate leads/prospects tables | 50% fewer tables, no copy-on-conversion, simpler maintenance | More complex state machine, mixed lifecycle in one table, potential audit concerns |
| A2 | **Separate BRDs per domain** — Split into 3 BRDs: Lead/Prospect CRM, Campaign Management, RM Productivity (Calendar/Call Reports/Tasks) | Focused scope, independent delivery timelines, clearer ownership | Cross-cutting concerns (entity references, notifications) need coordination |
| A3 | **Buy vs. Build for Campaign Module** — Use Mailchimp/HubSpot for campaign management instead of building in-house | Mature email infrastructure, analytics, unsubscribe management | Integration complexity, data residency concerns for HNI PII, ongoing cost |
| A4 | **Event-sourced contact management** — Instead of mutable CRUD, store all contact changes as immutable events | Perfect audit trail, natural undo, temporal queries ("state at date X") | Higher implementation complexity, unfamiliar pattern for team, storage growth |

---

## 8. Final Verdict

### **APPROVED WITH CONDITIONS**

The Lead & Prospect Management BRD is a high-quality, domain-specific requirements document that would enable implementation of a valuable wealth management CRM module. Its functional coverage, data modeling, and phased delivery plan are sound. However, the following conditions must be met before development begins:

**Mandatory Conditions (must be resolved):**

1. **Add Data Privacy & Consent section** — Define consent capture workflow, data retention policies per entity/status, right-to-erasure/anonymization process, and communication preferences entity. This is a regulatory requirement, not an enhancement.

2. **Add `communication_preferences` entity** — Track opt-in/opt-out per contact per channel, with consent date, source, and unsubscribe processing workflow. Integrate with campaign dispatch logic.

3. **Add optimistic locking** — Add `version` column to leads, prospects, campaigns, and call_reports tables. Specify 409 Conflict response on version mismatch.

4. **Specify bulk upload transaction boundaries** — Define batch size (recommended: 100), per-batch commit strategy, and behavior on mid-batch failure.

**Recommended Improvements (should be resolved):**

5. **Document fuzzy matching strategy** — Specify pg_trgm extension as a technical dependency for negative list screening. Add to Assumptions section.

6. **Add `delivery_status` to notifications** — Track PENDING/SENT/FAILED/DELIVERED per notification for operational visibility.

7. **Evaluate unified contact model** — Before implementation, conduct a technical spike comparing the current separate-tables approach vs. unified `contacts` table with stage enum. Document the decision with trade-off analysis.

8. **Consider replacing polymorphic references** — For call_reports, meetings, tasks, and opportunities, evaluate explicit nullable FK columns with CHECK constraints vs. current related_entity_type/id pattern.

---

## 9. Recommended Next Steps

1. **Revise BRD** incorporating the 4 mandatory conditions above (~1-2 days effort)
2. **Technical spike** on unified vs. separate contact model (~2 days)
3. **Generate test cases** from the revised BRD (use /test-case-generator)
4. **Create phased development plan** breaking Phase 1 into sprint-sized work packages
5. **Set up development branch** with new schema tables in existing Trust OMS
6. **Implement Phase 1** (Lead + Prospect CRUD + Dedupe + Blacklist + Conversion) as first deliverable

---

*Generated by Claude Code — Adversarial Idea Evaluator*
