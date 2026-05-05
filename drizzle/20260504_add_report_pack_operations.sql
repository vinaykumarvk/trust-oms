ALTER TABLE report_pack_templates
  ADD COLUMN IF NOT EXISTS output_formats jsonb NOT NULL DEFAULT '["JSON"]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_delivery_channels jsonb NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retention_years integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS masking_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS report_pack_runs (
  id serial PRIMARY KEY,
  run_id text UNIQUE NOT NULL,
  template_id integer REFERENCES report_pack_templates(id),
  pack_name text NOT NULL,
  run_status text NOT NULL DEFAULT 'QUEUED',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  report_count integer NOT NULL DEFAULT 0,
  output_count integer NOT NULL DEFAULT 0,
  failure_reason text,
  exception_id integer REFERENCES exception_items(id),
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

CREATE TABLE IF NOT EXISTS report_pack_outputs (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES report_pack_runs(id),
  report_type text NOT NULL,
  output_format text NOT NULL DEFAULT 'JSON',
  output_status text NOT NULL DEFAULT 'GENERATED',
  row_count integer NOT NULL DEFAULT 0,
  file_reference text NOT NULL,
  file_size_bytes integer NOT NULL DEFAULT 0,
  content_hash text NOT NULL,
  generation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_until date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  delivery_channel text NOT NULL DEFAULT 'IN_APP',
  recipient_type text,
  recipient_id text,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  delivered_at timestamptz,
  delivery_error text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  exception_id integer REFERENCES exception_items(id),
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

CREATE INDEX IF NOT EXISTS idx_report_pack_runs_template
  ON report_pack_runs(template_id);

CREATE INDEX IF NOT EXISTS idx_report_pack_runs_status
  ON report_pack_runs(run_status);

CREATE INDEX IF NOT EXISTS idx_report_pack_outputs_run
  ON report_pack_outputs(run_id);

CREATE INDEX IF NOT EXISTS idx_report_pack_outputs_delivery
  ON report_pack_outputs(delivery_status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_report_pack_outputs_report_type
  ON report_pack_outputs(report_type);
