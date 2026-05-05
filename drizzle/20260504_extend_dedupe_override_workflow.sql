ALTER TABLE dedupe_overrides
  ALTER COLUMN entity_id TYPE text USING entity_id::text,
  ALTER COLUMN matched_entity_id TYPE text USING matched_entity_id::text;

ALTER TABLE dedupe_overrides
  ADD COLUMN IF NOT EXISTS matched_fields jsonb,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS reviewer_user_id integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS override_status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewer_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer_comments text,
  ADD COLUMN IF NOT EXISTS decision_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_dedupe_overrides_entity
  ON dedupe_overrides(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_dedupe_overrides_match
  ON dedupe_overrides(matched_entity_type, matched_entity_id);

CREATE INDEX IF NOT EXISTS idx_dedupe_overrides_status
  ON dedupe_overrides(override_status);
