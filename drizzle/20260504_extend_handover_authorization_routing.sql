DO $$
BEGIN
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'handover_authorization_routed';
  ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'handover_authorization_escalated';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE handover_notification_type ADD VALUE IF NOT EXISTS 'handover_authorization_escalated';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE handovers
  ADD COLUMN IF NOT EXISTS source_branch_id integer REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS target_branch_id integer REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS authorization_route text NOT NULL DEFAULT 'BRANCH_UNRESOLVED',
  ADD COLUMN IF NOT EXISTS checker_branch_id integer REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS secondary_checker_branch_id integer REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS required_checker_role text NOT NULL DEFAULT 'BO_HEAD',
  ADD COLUMN IF NOT EXISTS authorization_owner_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS authorization_owner_team text,
  ADD COLUMN IF NOT EXISTS authorization_due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS escalation_due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS escalated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS escalated_to_team text,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS routing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS routing_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE handovers h
SET
  source_branch_id = COALESCE(h.source_branch_id, out_u.branch_id),
  target_branch_id = COALESCE(h.target_branch_id, in_u.branch_id),
  authorization_route = CASE
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
      OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
      THEN 'BRANCH_UNRESOLVED'
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
      THEN 'SAME_BRANCH'
    ELSE 'CROSS_BRANCH'
  END,
  checker_branch_id = CASE
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
      OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
      THEN NULL
    ELSE COALESCE(h.target_branch_id, in_u.branch_id)
  END,
  secondary_checker_branch_id = CASE
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NOT NULL
      AND COALESCE(h.target_branch_id, in_u.branch_id) IS NOT NULL
      AND COALESCE(h.source_branch_id, out_u.branch_id) <> COALESCE(h.target_branch_id, in_u.branch_id)
      THEN COALESCE(h.source_branch_id, out_u.branch_id)
    ELSE NULL
  END,
  required_checker_role = CASE
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
      OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
      THEN 'BO_HEAD'
    ELSE 'BO_CHECKER'
  END,
  authorization_owner_team = CASE
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
      OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
      THEN 'BO_HEAD'
    WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
      THEN 'BRANCH_AUTHORIZATION'
    ELSE 'TARGET_BRANCH_AUTHORIZATION'
  END,
  authorization_due_at = COALESCE(h.authorization_due_at, h.sla_deadline, h.created_at + INTERVAL '48 hours'),
  escalation_due_at = COALESCE(h.escalation_due_at, COALESCE(h.sla_deadline, h.created_at + INTERVAL '48 hours') + INTERVAL '8 hours'),
  routing_snapshot = CASE
    WHEN h.routing_snapshot <> '{}'::jsonb THEN h.routing_snapshot
    ELSE jsonb_build_object(
      'route_type', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN 'BRANCH_UNRESOLVED'
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
          THEN 'SAME_BRANCH'
        ELSE 'CROSS_BRANCH'
      END,
      'source_branch_id', COALESCE(h.source_branch_id, out_u.branch_id),
      'target_branch_id', COALESCE(h.target_branch_id, in_u.branch_id),
      'checker_branch_id', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN NULL
        ELSE COALESCE(h.target_branch_id, in_u.branch_id)
      END,
      'required_checker_role', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN 'BO_HEAD'
        ELSE 'BO_CHECKER'
      END,
      'owner_team', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN 'BO_HEAD'
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
          THEN 'BRANCH_AUTHORIZATION'
        ELSE 'TARGET_BRANCH_AUTHORIZATION'
      END,
      'escalation_team', 'BO_HEAD',
      'routed_at', COALESCE(h.created_at, now())
    )
  END,
  routing_history = CASE
    WHEN jsonb_typeof(h.routing_history) = 'array' AND jsonb_array_length(h.routing_history) > 0 THEN h.routing_history
    ELSE jsonb_build_array(jsonb_build_object(
      'action', 'ROUTED',
      'at', COALESCE(h.created_at, now()),
      'actor_id', h.created_by,
      'route_type', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN 'BRANCH_UNRESOLVED'
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
          THEN 'SAME_BRANCH'
        ELSE 'CROSS_BRANCH'
      END,
      'owner_team', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN 'BO_HEAD'
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) = COALESCE(h.target_branch_id, in_u.branch_id)
          THEN 'BRANCH_AUTHORIZATION'
        ELSE 'TARGET_BRANCH_AUTHORIZATION'
      END,
      'checker_branch_id', CASE
        WHEN COALESCE(h.source_branch_id, out_u.branch_id) IS NULL
          OR COALESCE(h.target_branch_id, in_u.branch_id) IS NULL
          THEN NULL
        ELSE COALESCE(h.target_branch_id, in_u.branch_id)
      END,
      'escalation_team', 'BO_HEAD',
      'reason', 'MIGRATION_BACKFILL'
    ))
  END
FROM users out_u, users in_u
WHERE out_u.id = h.outgoing_rm_id
  AND in_u.id = h.incoming_rm_id;

CREATE INDEX IF NOT EXISTS idx_handovers_authorization_route
  ON handovers(authorization_route);

CREATE INDEX IF NOT EXISTS idx_handovers_checker_branch
  ON handovers(checker_branch_id);

CREATE INDEX IF NOT EXISTS idx_handovers_authorization_due
  ON handovers(authorization_due_at);

CREATE INDEX IF NOT EXISTS idx_handovers_escalated_at
  ON handovers(escalated_at);
