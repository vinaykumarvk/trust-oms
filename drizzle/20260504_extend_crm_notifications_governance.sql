ALTER TABLE crm_notifications
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'P3',
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS owner_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS acknowledged_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS escalated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS escalated_to_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS escalated_to_team text,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closure_evidence jsonb,
  ADD COLUMN IF NOT EXISTS governance_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE crm_notifications
SET
  owner_user_id = COALESCE(owner_user_id, recipient_user_id),
  sla_due_at = COALESCE(sla_due_at, created_at + interval '72 hours'),
  governance_history = CASE
    WHEN jsonb_typeof(governance_history) = 'array' AND jsonb_array_length(governance_history) > 0 THEN governance_history
    ELSE jsonb_build_array(jsonb_build_object(
      'action', 'CREATED',
      'status', lifecycle_status,
      'at', created_at,
      'actor_user_id', NULL,
      'owner_user_id', COALESCE(owner_user_id, recipient_user_id),
      'owner_team', owner_team
    ))
  END
WHERE governance_history IS NULL
   OR jsonb_typeof(governance_history) <> 'array'
   OR jsonb_array_length(governance_history) = 0
   OR owner_user_id IS NULL
   OR sla_due_at IS NULL;

CREATE INDEX IF NOT EXISTS crm_notifications_recipient_idx ON crm_notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS crm_notifications_owner_idx ON crm_notifications(owner_user_id);
CREATE INDEX IF NOT EXISTS crm_notifications_lifecycle_idx ON crm_notifications(lifecycle_status);
CREATE INDEX IF NOT EXISTS crm_notifications_sla_due_idx ON crm_notifications(sla_due_at);
