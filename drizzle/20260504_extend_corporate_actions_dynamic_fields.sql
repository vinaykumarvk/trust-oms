ALTER TABLE corporate_actions
  ADD COLUMN IF NOT EXISTS event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS required_field_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_validation_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS field_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE corporate_actions
SET
  event_payload = COALESCE(event_payload, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'security_id', security_id,
      'ex_date', ex_date,
      'record_date', record_date,
      'payment_date', payment_date,
      'ratio', ratio,
      'amount_per_share', amount_per_share,
      'election_deadline', election_deadline
    )),
  required_field_snapshot = CASE
    WHEN jsonb_typeof(required_field_snapshot) = 'array' AND jsonb_array_length(required_field_snapshot) > 0 THEN required_field_snapshot
    ELSE '["security_id","ex_date","record_date"]'::jsonb
  END,
  field_validation_status = COALESCE(NULLIF(field_validation_status, ''), 'PENDING'),
  field_validation_errors = COALESCE(field_validation_errors, '[]'::jsonb),
  field_history = CASE
    WHEN jsonb_typeof(field_history) = 'array' AND jsonb_array_length(field_history) > 0 THEN field_history
    ELSE jsonb_build_array(jsonb_build_object(
      'action', 'VALIDATED',
      'status', COALESCE(NULLIF(field_validation_status, ''), 'PENDING'),
      'at', updated_at,
      'actor_id', updated_by,
      'errors', COALESCE(field_validation_errors, '[]'::jsonb),
      'required_fields', COALESCE(required_field_snapshot, '[]'::jsonb)
    ))
  END;

CREATE INDEX IF NOT EXISTS corporate_actions_field_validation_idx
  ON corporate_actions(field_validation_status);

CREATE INDEX IF NOT EXISTS corporate_actions_type_field_validation_idx
  ON corporate_actions(type, field_validation_status);
