-- Migration: Add Danamon OEMS minimum trustworthy order foundation
-- Date: 2026-05-06
-- Scope: Additive schema for governed product/security master, rule traceability,
-- source evidence, product tickets, outbox, audit events, and feature flags.

CREATE TABLE IF NOT EXISTS oems_product_security_master (
  id serial PRIMARY KEY,
  security_id text UNIQUE NOT NULL,
  legacy_product_id integer REFERENCES oems_products(id),
  product_code text NOT NULL,
  product_family oems_product_family NOT NULL,
  instrument_type text NOT NULL,
  display_name text NOT NULL,
  issuer_name text,
  isin text,
  market text DEFAULT 'ID',
  currency text NOT NULL DEFAULT 'IDR',
  risk_score integer NOT NULL DEFAULT 1,
  settlement_calendar_key text NOT NULL DEFAULT 'ID_BUSINESS',
  price_source text,
  tax_category text NOT NULL DEFAULT 'STANDARD',
  product_security_status text NOT NULL DEFAULT 'DRAFT',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  approved_by text,
  approved_at timestamptz,
  rejected_reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_security_master_risk_score CHECK (risk_score BETWEEN 1 AND 6),
  CONSTRAINT chk_oems_security_master_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_oems_security_master_status CHECK (product_security_status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','REJECTED','INACTIVE')),
  CONSTRAINT chk_oems_security_master_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_security_master_security_id ON oems_product_security_master(security_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_security_master_product_code ON oems_product_security_master(product_code);
CREATE INDEX IF NOT EXISTS idx_oems_security_master_family_status ON oems_product_security_master(product_family, product_security_status);
CREATE INDEX IF NOT EXISTS idx_oems_security_master_legacy_product ON oems_product_security_master(legacy_product_id);

CREATE TABLE IF NOT EXISTS oems_policy_rule_traceability (
  id serial PRIMARY KEY,
  traceability_id text UNIQUE NOT NULL,
  product_security_id integer REFERENCES oems_product_security_master(id),
  security_id text REFERENCES oems_product_security_master(security_id),
  rule_set_id text,
  rule_code text NOT NULL,
  rule_version integer NOT NULL DEFAULT 1,
  policy_reference text NOT NULL,
  policy_owner_role text NOT NULL,
  control_objective text NOT NULL,
  test_reference text NOT NULL,
  certification_status text NOT NULL DEFAULT 'DRAFT',
  certified_by text,
  certified_at timestamptz,
  recertification_due_at date,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_policy_traceability_status CHECK (certification_status IN ('DRAFT','CERTIFIED','EXPIRED','REVOKED')),
  CONSTRAINT chk_oems_policy_traceability_certified CHECK (
    certification_status <> 'CERTIFIED'
    OR (certified_by IS NOT NULL AND certified_at IS NOT NULL AND recertification_due_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_policy_traceability_id ON oems_policy_rule_traceability(traceability_id);
CREATE INDEX IF NOT EXISTS idx_oems_policy_traceability_rule ON oems_policy_rule_traceability(rule_code, rule_version, certification_status);
CREATE INDEX IF NOT EXISTS idx_oems_policy_traceability_security ON oems_policy_rule_traceability(security_id);

CREATE TABLE IF NOT EXISTS oems_product_order_tickets (
  id serial PRIMARY KEY,
  ticket_id text UNIQUE NOT NULL,
  order_id text REFERENCES oems_orders(order_id),
  product_family oems_product_family NOT NULL,
  security_id text NOT NULL REFERENCES oems_product_security_master(security_id),
  ticket_type text NOT NULL,
  customer_id text REFERENCES clients(client_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  channel oems_channel NOT NULL DEFAULT 'OEMS_DIRECT',
  transaction_type text NOT NULL,
  amount numeric(21,4),
  quantity numeric(21,4),
  currency text NOT NULL DEFAULT 'IDR',
  source_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  capture_status text NOT NULL DEFAULT 'DRAFT',
  feature_flag_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_ticket_amount CHECK (amount IS NULL OR amount > 0),
  CONSTRAINT chk_oems_ticket_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_oems_ticket_capture_status CHECK (capture_status IN ('DRAFT','READY_FOR_VALIDATION','VALIDATION_FAILED','READY_FOR_SUBMISSION','CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_product_order_ticket_id ON oems_product_order_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_oems_product_order_ticket_order ON oems_product_order_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_product_order_ticket_family_status ON oems_product_order_tickets(product_family, capture_status);
CREATE INDEX IF NOT EXISTS idx_oems_product_order_ticket_security ON oems_product_order_tickets(security_id);

CREATE TABLE IF NOT EXISTS oems_source_system_evidence (
  id serial PRIMARY KEY,
  evidence_id text UNIQUE NOT NULL,
  ticket_id text REFERENCES oems_product_order_tickets(ticket_id),
  order_id text REFERENCES oems_orders(order_id),
  source_system text NOT NULL,
  evidence_type text NOT NULL,
  evidence_status text NOT NULL DEFAULT 'PENDING',
  owner_role text NOT NULL DEFAULT 'INTEGRATION_OPS',
  source_timestamp timestamptz,
  stale_after_at timestamptz,
  failure_code text,
  fallback_approval_id text,
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_source_evidence_status CHECK (evidence_status IN ('AVAILABLE','STALE','FAILED','PENDING','CONFLICT','DEGRADED_APPROVED')),
  CONSTRAINT chk_oems_source_evidence_failure CHECK (evidence_status <> 'FAILED' OR failure_code IS NOT NULL),
  CONSTRAINT chk_oems_source_evidence_fallback CHECK (evidence_status <> 'DEGRADED_APPROVED' OR fallback_approval_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_source_evidence_id ON oems_source_system_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_oems_source_evidence_ticket ON oems_source_system_evidence(ticket_id);
CREATE INDEX IF NOT EXISTS idx_oems_source_evidence_order ON oems_source_system_evidence(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_source_evidence_status ON oems_source_system_evidence(source_system, evidence_status);

CREATE TABLE IF NOT EXISTS oems_outbox_events (
  id serial PRIMARY KEY,
  outbox_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  publish_status text NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_outbox_publish_status CHECK (publish_status IN ('PENDING','SENT','FAILED','DEAD_LETTER','CANCELLED')),
  CONSTRAINT chk_oems_outbox_attempt_count CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_outbox_id ON oems_outbox_events(outbox_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_outbox_idempotency ON oems_outbox_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_oems_outbox_status ON oems_outbox_events(publish_status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_oems_outbox_aggregate ON oems_outbox_events(aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS oems_audit_events (
  id serial PRIMARY KEY,
  audit_event_id text UNIQUE NOT NULL,
  event_code text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  actor_user_id text,
  actor_role text,
  before_state jsonb,
  after_state jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_audit_event_id ON oems_audit_events(audit_event_id);
CREATE INDEX IF NOT EXISTS idx_oems_audit_events_aggregate ON oems_audit_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_oems_audit_events_code ON oems_audit_events(event_code, occurred_at);
CREATE INDEX IF NOT EXISTS idx_oems_audit_events_correlation ON oems_audit_events(event_correlation_id);

CREATE TABLE IF NOT EXISTS oems_feature_flags (
  id serial PRIMARY KEY,
  flag_code text UNIQUE NOT NULL,
  flag_name text NOT NULL,
  product_family oems_product_family,
  enabled boolean NOT NULL DEFAULT false,
  enabled_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollout_percent integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_feature_flags_rollout CHECK (rollout_percent BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_feature_flag_code ON oems_feature_flags(flag_code);
CREATE INDEX IF NOT EXISTS idx_oems_feature_flags_family ON oems_feature_flags(product_family, enabled);

CREATE TABLE IF NOT EXISTS oems_control_ownership (
  id serial PRIMARY KEY,
  control_id text UNIQUE NOT NULL,
  control_domain text NOT NULL,
  control_type text NOT NULL,
  control_code text NOT NULL,
  owner_role text NOT NULL,
  owner_user_id text,
  sla_minutes integer NOT NULL DEFAULT 240,
  escalation_role text NOT NULL DEFAULT 'BO_HEAD',
  recertification_due_at date,
  control_status text NOT NULL DEFAULT 'ACTIVE',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_control_status CHECK (control_status IN ('ACTIVE','SUSPENDED','RETIRED')),
  CONSTRAINT chk_oems_control_sla CHECK (sla_minutes > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_control_ownership_id ON oems_control_ownership(control_id);
CREATE INDEX IF NOT EXISTS idx_oems_control_ownership_domain ON oems_control_ownership(control_domain, control_status);
CREATE INDEX IF NOT EXISTS idx_oems_control_ownership_owner ON oems_control_ownership(owner_role, recertification_due_at);

CREATE TABLE IF NOT EXISTS oems_control_attestations (
  id serial PRIMARY KEY,
  attestation_id text UNIQUE NOT NULL,
  control_id text NOT NULL REFERENCES oems_control_ownership(control_id),
  attestation_status text NOT NULL DEFAULT 'ATTESTED',
  attested_by text NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_recertification_due_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_control_attestation_status CHECK (attestation_status IN ('ATTESTED','EXCEPTION','FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_control_attestation_id ON oems_control_attestations(attestation_id);
CREATE INDEX IF NOT EXISTS idx_oems_control_attestation_control ON oems_control_attestations(control_id, attested_at);

CREATE TABLE IF NOT EXISTS oems_reconciliation_obligations (
  id serial PRIMARY KEY,
  obligation_id text UNIQUE NOT NULL,
  source_evidence_id text REFERENCES oems_source_system_evidence(evidence_id),
  order_id text REFERENCES oems_orders(order_id),
  ticket_id text REFERENCES oems_product_order_tickets(ticket_id),
  source_system text NOT NULL,
  owner_role text NOT NULL,
  obligation_status text NOT NULL DEFAULT 'OPEN',
  customer_impact text NOT NULL,
  fallback_reason text NOT NULL,
  due_at timestamptz NOT NULL,
  closed_by text,
  closed_at timestamptz,
  closure_reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_recon_obligation_status CHECK (obligation_status IN ('OPEN','IN_PROGRESS','CLOSED','WAIVED','BREACHED')),
  CONSTRAINT chk_oems_recon_closure CHECK (obligation_status NOT IN ('CLOSED','WAIVED') OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND closure_reason IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_recon_obligation_id ON oems_reconciliation_obligations(obligation_id);
CREATE INDEX IF NOT EXISTS idx_oems_recon_obligation_status ON oems_reconciliation_obligations(obligation_status, due_at);
CREATE INDEX IF NOT EXISTS idx_oems_recon_obligation_source ON oems_reconciliation_obligations(source_system, owner_role);
CREATE INDEX IF NOT EXISTS idx_oems_recon_obligation_order ON oems_reconciliation_obligations(order_id);

CREATE TABLE IF NOT EXISTS oems_fee_tax_schedules (
  id serial PRIMARY KEY,
  schedule_id text UNIQUE NOT NULL,
  product_family oems_product_family NOT NULL,
  security_id text REFERENCES oems_product_security_master(security_id),
  transaction_type text NOT NULL,
  market text NOT NULL DEFAULT 'ID',
  customer_segment text NOT NULL DEFAULT 'STANDARD',
  fee_type text NOT NULL,
  fee_rate_type text NOT NULL DEFAULT 'PERCENTAGE',
  fee_rate numeric(18,8) NOT NULL DEFAULT 0,
  tax_rate numeric(18,8) NOT NULL DEFAULT 0,
  calendar_key text NOT NULL DEFAULT 'ID_BUSINESS',
  settlement_lag_days integer NOT NULL DEFAULT 0,
  schedule_status text NOT NULL DEFAULT 'DRAFT',
  schedule_version integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  approved_by text,
  approved_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_fee_tax_rate_type CHECK (fee_rate_type IN ('PERCENTAGE','FLAT','PER_UNIT','INFORMATIONAL')),
  CONSTRAINT chk_oems_fee_tax_schedule_status CHECK (schedule_status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','REJECTED','RETIRED')),
  CONSTRAINT chk_oems_fee_tax_nonnegative CHECK (fee_rate >= 0 AND tax_rate >= 0 AND settlement_lag_days >= 0),
  CONSTRAINT chk_oems_fee_tax_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_fee_tax_schedule_id ON oems_fee_tax_schedules(schedule_id);
CREATE INDEX IF NOT EXISTS idx_oems_fee_tax_schedule_lookup ON oems_fee_tax_schedules(product_family, transaction_type, market, customer_segment, schedule_status);
CREATE INDEX IF NOT EXISTS idx_oems_fee_tax_schedule_security ON oems_fee_tax_schedules(security_id);

CREATE TABLE IF NOT EXISTS oems_migration_compatibility_queue (
  id serial PRIMARY KEY,
  queue_id text UNIQUE NOT NULL,
  migration_name text NOT NULL,
  item_type text NOT NULL DEFAULT 'DATA_COMPATIBILITY',
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  owner_role text NOT NULL DEFAULT 'BO_HEAD',
  compatibility_status text NOT NULL DEFAULT 'OPEN',
  blocking boolean NOT NULL DEFAULT true,
  due_at timestamptz,
  resolved_by text,
  resolved_at timestamptz,
  resolution_notes text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT chk_oems_migration_compat_status CHECK (compatibility_status IN ('OPEN','IN_PROGRESS','RESOLVED','WAIVED','BLOCKED')),
  CONSTRAINT chk_oems_migration_compat_resolution CHECK (compatibility_status NOT IN ('RESOLVED','WAIVED') OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_migration_compat_queue_id ON oems_migration_compatibility_queue(queue_id);
CREATE INDEX IF NOT EXISTS idx_oems_migration_compat_status ON oems_migration_compatibility_queue(migration_name, compatibility_status, due_at);
CREATE INDEX IF NOT EXISTS idx_oems_migration_compat_owner ON oems_migration_compatibility_queue(owner_role, compatibility_status);
CREATE INDEX IF NOT EXISTS idx_oems_migration_compat_entity ON oems_migration_compatibility_queue(entity_type, entity_id);
