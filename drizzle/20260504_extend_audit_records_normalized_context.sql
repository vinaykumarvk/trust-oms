ALTER TABLE audit_records
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS actor_source text,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_channel text;

UPDATE audit_records
SET
  event_type = COALESCE(event_type, action::text),
  actor_source = COALESCE(actor_source, CASE WHEN actor_id IS NULL THEN 'SYSTEM' ELSE 'USER' END),
  source_system = COALESCE(source_system, 'TRUST_OMS')
WHERE event_type IS NULL
   OR actor_source IS NULL
   OR source_system IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_event_type
  ON audit_records(event_type);

CREATE INDEX IF NOT EXISTS idx_audit_source
  ON audit_records(source_system, source_channel);

CREATE INDEX IF NOT EXISTS idx_audit_correlation
  ON audit_records(correlation_id);
