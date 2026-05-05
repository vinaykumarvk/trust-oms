DO $$
BEGIN
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_upload_queued';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_upload_attempt_started';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_upload_attempt_completed';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_upload_retry_scheduled';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_upload_processed';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_row_processed';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_row_failed';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE bulk_upload_status ADD VALUE IF NOT EXISTS 'queued';
  ALTER TYPE bulk_upload_status ADD VALUE IF NOT EXISTS 'retry_pending';
  ALTER TYPE bulk_upload_status ADD VALUE IF NOT EXISTS 'partially_completed';
  ALTER TYPE bulk_upload_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE bulk_upload_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS input_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS row_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS group_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS processing_cursor integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS resume_token text,
  ADD COLUMN IF NOT EXISTS is_background boolean NOT NULL DEFAULT true;

UPDATE bulk_upload_logs
SET
  input_rows = CASE WHEN jsonb_typeof(input_rows) = 'array' THEN input_rows ELSE '[]'::jsonb END,
  row_results = CASE WHEN jsonb_typeof(row_results) = 'array' THEN row_results ELSE '[]'::jsonb END,
  group_results = CASE
    WHEN jsonb_typeof(group_results) = 'array' AND jsonb_array_length(group_results) > 0 THEN group_results
    WHEN error_details IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
      'group_key', 'legacy',
      'row_numbers', '[]'::jsonb,
      'status', CASE WHEN error_count > 0 THEN 'failed' ELSE 'success' END,
      'attempts', 1,
      'error', error_details,
      'updated_at', COALESCE(updated_at, created_at, now())
    ))
    ELSE '[]'::jsonb
  END,
  started_at = COALESCE(started_at, created_at),
  last_attempt_at = COALESCE(last_attempt_at, updated_at, created_at),
  completed_at = CASE
    WHEN status IN ('completed', 'failed') THEN COALESCE(completed_at, updated_at, created_at)
    ELSE completed_at
  END,
  max_retries = COALESCE(max_retries, 3),
  retry_count = COALESCE(retry_count, 0),
  processing_cursor = COALESCE(processing_cursor, total_rows);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_logs_status
  ON bulk_upload_logs(status);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_logs_next_retry_at
  ON bulk_upload_logs(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_logs_idempotency_key
  ON bulk_upload_logs(idempotency_key);
