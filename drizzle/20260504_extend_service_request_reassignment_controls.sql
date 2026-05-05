ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS reassignment_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_reassigned_at timestamp,
  ADD COLUMN IF NOT EXISTS last_reassigned_by text,
  ADD COLUMN IF NOT EXISTS last_reassignment_role text,
  ADD COLUMN IF NOT EXISTS last_reassignment_reason text;

CREATE INDEX IF NOT EXISTS service_requests_last_reassigned_at_idx
  ON service_requests(last_reassigned_at);
