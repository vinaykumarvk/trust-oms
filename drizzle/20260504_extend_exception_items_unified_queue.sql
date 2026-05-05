ALTER TABLE exception_items
  ADD COLUMN IF NOT EXISTS exception_domain text NOT NULL DEFAULT 'TRUST_FEES',
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_object_uri text,
  ADD COLUMN IF NOT EXISTS sla_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assignment_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS resolution_evidence jsonb,
  ADD COLUMN IF NOT EXISTS root_cause_code text,
  ADD COLUMN IF NOT EXISTS client_impact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regulatory_impact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_exception_items_domain_status
  ON exception_items(exception_domain, exception_status);

CREATE INDEX IF NOT EXISTS idx_exception_items_source_object
  ON exception_items(source_aggregate_type, source_aggregate_id);

CREATE INDEX IF NOT EXISTS idx_exception_items_sla
  ON exception_items(exception_status, sla_due_at);
