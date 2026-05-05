ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_failure_queued';
ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_failure_assigned';
ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_failure_resolved';
ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_failure_retried';

ALTER TABLE bulk_upload_logs
  ADD COLUMN IF NOT EXISTS input_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS row_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS group_results jsonb NOT NULL DEFAULT '[]'::jsonb;

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
  END;

CREATE TABLE IF NOT EXISTS bulk_upload_failure_items (
  id serial PRIMARY KEY,
  upload_id integer NOT NULL REFERENCES bulk_upload_logs(id),
  group_key text NOT NULL,
  row_number integer NOT NULL,
  row_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  failure_status text NOT NULL DEFAULT 'OPEN',
  assigned_to integer REFERENCES users(id),
  assigned_at timestamptz,
  resolution_code text,
  resolution_notes text,
  resolved_by integer REFERENCES users(id),
  resolved_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_retried_at timestamptz,
  linked_handover_id integer REFERENCES handovers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  tenant_id text NOT NULL DEFAULT 'default',
  is_deleted boolean NOT NULL DEFAULT false,
  correlation_id text,
  audit_hash text
);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_failure_items_upload
  ON bulk_upload_failure_items(upload_id);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_failure_items_status
  ON bulk_upload_failure_items(failure_status);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_failure_items_assignee
  ON bulk_upload_failure_items(assigned_to);

INSERT INTO bulk_upload_failure_items (
  upload_id,
  group_key,
  row_number,
  row_payload,
  error_message,
  failure_status,
  created_by,
  updated_by
)
SELECT
  bul.id,
  failed_group->>'group_key',
  COALESCE((row_number_text)::integer, 0),
  COALESCE(bul.input_rows->((row_number_text)::integer - 1), '{}'::jsonb),
  failed_group->>'error',
  'OPEN',
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
FROM bulk_upload_logs bul
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(bul.group_results, '[]'::jsonb)) failed_group
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(failed_group->'row_numbers', '[]'::jsonb)) row_number_text
WHERE failed_group->>'status' = 'failed'
  AND NOT EXISTS (
    SELECT 1
    FROM bulk_upload_failure_items existing
    WHERE existing.upload_id = bul.id
      AND existing.row_number = (row_number_text)::integer
      AND existing.failure_status IN ('OPEN', 'ASSIGNED', 'RETRY_FAILED')
  );
