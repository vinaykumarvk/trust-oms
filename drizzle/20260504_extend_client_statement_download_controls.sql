ALTER TABLE client_statements
  ADD COLUMN IF NOT EXISTS report_pack_output_id integer REFERENCES report_pack_outputs(id),
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS retention_policy text NOT NULL DEFAULT 'CLIENT_STATEMENT_7Y',
  ADD COLUMN IF NOT EXISTS retention_until date,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_downloaded_by text,
  ADD COLUMN IF NOT EXISTS last_downloaded_ip text,
  ADD COLUMN IF NOT EXISTS access_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE client_statements
SET retention_until = COALESCE(retention_until, (COALESCE(generated_at, created_at, now())::date + INTERVAL '7 years')::date)
WHERE retention_until IS NULL;

CREATE INDEX IF NOT EXISTS client_statements_retention_idx
  ON client_statements(retention_until);
