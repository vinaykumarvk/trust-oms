# Phased Development Plan: HAM Release 1

## Phase 1: Schema & Data Model (Foundation)
- Add 7 new enums to schema.ts (handoverStatus, handoverEntityType, scrutinyStatus, complianceGateType, complianceGateResult, handoverAuditEventType, slaEntityType)
- Add 7 new tables (handovers, handover_items, scrutiny_checklist_items, scrutiny_templates, compliance_gates, handover_audit_log, sla_configurations)
- Add assigned_rm_id column to clients/leads/prospects tables if missing
- Add DB unique constraint on handover_items(entity_id) WHERE status IN (included, transferred)

## Phase 2: Core Services
- handover-service.ts — CRUD, submit, authorize, reject, cancel, reverse
- compliance-gate-service.ts — 5 gate types with circuit breaker pattern
- handover-audit-service.ts — append-only audit logging
- sla-service.ts — SLA calculation and threshold checks
- handover-notification-service.ts — email + in-app notification orchestration

## Phase 3: API Routes
- server/routes/back-office/handovers.ts — 17 Release 1 endpoints
- Register in server/routes.ts
- Add handover permission entries to PERMISSION_MATRIX
- Add requireHandoverRole guard

## Phase 4: Frontend Pages
- Handover Dashboard (FR-014)
- Handover Initiation Form with tabs (FR-001, FR-002, FR-003)
- Authorization Queue (FR-004)
- Audit Trail Viewer (FR-018)
- Register routes in apps/back-office/src/routes/index.tsx

## Phase 5: Integration & Polish
- Wire compliance gates to existing KYC/sanctions services
- SLA notification scheduling
- Dark mode, responsive, i18n labels
- Build verification
