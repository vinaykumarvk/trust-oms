ALTER TABLE service_request_documents
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS upload_ip text,
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS retention_policy text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_accessed_by_type text,
  ADD COLUMN IF NOT EXISTS last_accessed_by_id text,
  ADD COLUMN IF NOT EXISTS access_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sr_documents_content_hash
  ON service_request_documents(content_hash);

CREATE INDEX IF NOT EXISTS idx_sr_documents_retention
  ON service_request_documents(expires_at, legal_hold);
