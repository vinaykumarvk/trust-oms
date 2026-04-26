# Phased Development Plan: Risk Profiling & Proposal Generation
## Date: 2026-04-22

## Overview
Greenfield implementation of 18 data entities, 4 services, 10+ API route files, and 8 UI pages.
Follows existing codebase patterns: Drizzle ORM schema, createCrudRouter factory, React Query, shadcn/ui.

---

## Phase 1: Database Schema (Foundation)
**Dependencies:** None
**Goal:** Add all 18 entities + enums to schema.ts

### Tasks:
1. Add new enums: questionnaire_type, questionnaire_status, scoring_type, computation_type, risk_deviation_context, proposal_status, investment_objective, approval_level, approval_action, rebalance_frequency, escalation_type, escalation_status, resolution_action, audit_outcome
2. Add entities: questionnaires, questions, answer_options, score_normalization_ranges
3. Add entities: risk_appetite_mappings, risk_appetite_bands
4. Add entities: asset_allocation_configs, asset_allocation_lines
5. Add entities: customer_risk_profiles, customer_risk_responses
6. Add entities: investment_proposals, proposal_line_items, proposal_approvals
7. Add entities: product_risk_deviations
8. Add entity: risk_profiling_model_portfolios (separate from existing modelPortfolios)
9. Add entities: compliance_escalations, risk_profiling_audit_logs
10. Add all Drizzle relations

---

## Phase 2: Service Layer — Risk Profiling Engine
**Dependencies:** Phase 1
**Goal:** Core business logic for questionnaire management and risk assessment

### Tasks:
1. Create `server/services/risk-profiling-service.ts`:
   - Questionnaire CRUD with maker-checker status management
   - Question/option CRUD with cascading validation
   - Score computation engine (SUM scoring, RANGE normalization for multi-select)
   - Risk appetite band lookup (inclusive-lower, exclusive-upper)
   - Customer risk assessment creation (immutable records)
   - Risk profile deviation handling
   - Product risk deviation check and recording
   - Repeat deviation escalation logic (FR-038)
   - Audit log recording (FR-039)
   - Cascading config validation (FR-040)

---

## Phase 3: Service Layer — Proposal Engine
**Dependencies:** Phase 2
**Goal:** Investment proposal creation, suitability checks, approval workflow

### Tasks:
1. Create `server/services/proposal-service.ts`:
   - Proposal CRUD with auto-number generation (PROP-YYYYMMDD-XXXX)
   - Line item management with allocation % validation (sum = 100)
   - Automated suitability check (product risk vs client risk)
   - What-if analysis (expected return, std dev, Sharpe ratio computation)
   - Multi-level approval workflow (L1 → Compliance → Client)
   - Status transition enforcement (state machine)
   - PDF generation stub (server-side rendering placeholder)

---

## Phase 4: API Routes
**Dependencies:** Phase 2, Phase 3
**Goal:** REST API endpoints for all risk profiling and proposal operations

### Tasks:
1. Create `server/routes/back-office/risk-profiling.ts`:
   - CRUD for questionnaires, questions, options, normalization ranges
   - CRUD for risk appetite mappings and bands
   - CRUD for asset allocation configs and lines
   - Authorization endpoints (authorize/reject) for maker-checker entities
   - Customer risk assessment endpoints (create, list, get)
   - Risk deviation endpoints
   - Escalation endpoints
   - Supervisor dashboard aggregation endpoint
   - Cascading validation endpoint
2. Create `server/routes/back-office/proposals.ts`:
   - Proposal CRUD
   - Line item CRUD
   - Submit, approve, reject, return-for-revision actions
   - Suitability check endpoint
   - PDF generation endpoint
   - Client accept/reject endpoints
3. Register routes in `server/routes.ts` and CRUD entities in `server/routes/back-office/index.ts`

---

## Phase 5: UI Pages — Risk Profiling Administration
**Dependencies:** Phase 4
**Goal:** Back-office admin pages for configuration

### Tasks:
1. Create `apps/back-office/src/pages/questionnaire-maintenance.tsx`:
   - Questionnaire list grid with status badges
   - Create/edit form with dynamic question builder
   - Answer option management per question
   - Score normalization range config for multi-select questions
   - Maker-checker authorize/reject buttons
2. Create `apps/back-office/src/pages/risk-appetite-mapping.tsx`:
   - Mapping list with CRUD
   - Band configuration table (score_from, score_to, category, code)
   - Maker-checker workflow
3. Create `apps/back-office/src/pages/asset-allocation-config.tsx`:
   - Config list with CRUD
   - Allocation line editor per risk category
   - Percentage validation (sum = 100%)
   - Maker-checker workflow

---

## Phase 6: UI Pages — Risk Assessment & Proposals
**Dependencies:** Phase 5
**Goal:** RM-facing pages for customer assessment and proposal creation

### Tasks:
1. Create `apps/back-office/src/pages/risk-assessment-wizard.tsx`:
   - 3-step wizard (Edit Profile → Assess Risk → Transact/Plan)
   - Dynamic questionnaire rendering (radio/checkbox per question type)
   - Real-time score computation display
   - Recommended risk profile card with donut chart
   - Deviation handling (optional override with reason + supervisor approval)
   - Acknowledgement/disclaimer acceptance
2. Create `apps/back-office/src/pages/investment-proposals.tsx`:
   - Proposal list grid with status filters
   - Proposal builder form with product selection
   - What-if analysis panel (expected return, std dev, Sharpe)
   - Suitability check results display
   - Approval workflow buttons per role
   - Product risk deviation alerts (popup when product risk > client risk)
3. Create `apps/back-office/src/pages/supervisor-dashboard-rp.tsx`:
   - Lead status widget (Level 1 donut chart, Level 2 detail table)
   - Risk profiling completion metrics
   - Proposal approval queue
   - Team performance summary

---

## Phase 7: Route Registration & Integration
**Dependencies:** Phase 6
**Goal:** Wire everything together in the app router

### Tasks:
1. Update `apps/back-office/src/routes/index.tsx`:
   - Add routes for all new pages under appropriate nav sections
   - Risk Profiling section: Questionnaire Maintenance, Risk Appetite, Asset Allocation
   - RM Tools section: Risk Assessment Wizard, Investment Proposals
   - Supervision section: Supervisor Dashboard
2. Build verification: `npm run build`

---

## Phase 8: Reporting & Polish
**Dependencies:** Phase 7
**Goal:** Risk reports and final integration

### Tasks:
1. Add reporting endpoints to risk-profiling routes:
   - Transaction by Product Rating report
   - Product Risk Mismatch report
   - Proposal Pipeline report
   - Risk Distribution Analytics
2. Add report components to existing report builder or new risk reports page
3. Final build verification

---

## Execution Notes
- Each phase must pass `npm run build` before proceeding
- Use existing patterns: auditFields spread, createCrudRouter factory, pgEnum, React Query hooks
- Existing riskProfileEnum (CONSERVATIVE/MODERATE/BALANCED/GROWTH/AGGRESSIVE) stays — new risk_appetite_bands provides the configurable mapping
- Existing modelPortfolios table stays for rebalancing — new risk_profiling_model_portfolios is separate
