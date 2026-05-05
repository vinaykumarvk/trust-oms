ALTER TABLE degraded_mode_logs
  ADD COLUMN IF NOT EXISTS incident_status text NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS owner_user_id text,
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'P1',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS affected_feeds jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS failover_decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS resolution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_status_changed_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE degraded_mode_logs
SET
  incident_status = CASE WHEN ended_at IS NULL THEN 'OPEN' ELSE 'RESOLVED' END,
  reason = COALESCE(reason, fallback_path),
  affected_feeds = CASE
    WHEN jsonb_typeof(affected_feeds) = 'array' AND jsonb_array_length(affected_feeds) > 0 THEN affected_feeds
    WHEN failed_component::text LIKE 'Feed:%' THEN jsonb_build_array(replace(failed_component::text, 'Feed:', ''))
    ELSE '[]'::jsonb
  END,
  status_history = CASE
    WHEN jsonb_typeof(status_history) = 'array' AND jsonb_array_length(status_history) > 0 THEN status_history
    ELSE jsonb_build_array(jsonb_build_object(
      'status', CASE WHEN ended_at IS NULL THEN 'OPEN' ELSE 'RESOLVED' END,
      'at', COALESCE(ended_at, started_at),
      'actor_id', updated_by,
      'reason', COALESCE(reason, fallback_path)
    ))
  END,
  last_status_changed_at = COALESCE(ended_at, started_at, now());

ALTER TABLE feed_health_snapshots
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_feed_id text,
  ADD COLUMN IF NOT EXISTS last_switch_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS switch_reason text;

CREATE INDEX IF NOT EXISTS degraded_mode_logs_incident_status_idx
  ON degraded_mode_logs(incident_status);

CREATE INDEX IF NOT EXISTS degraded_mode_logs_owner_team_idx
  ON degraded_mode_logs(owner_team);

CREATE INDEX IF NOT EXISTS feed_health_snapshots_primary_idx
  ON feed_health_snapshots(feed_name, is_primary);
