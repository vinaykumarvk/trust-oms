ALTER TABLE questionnaires
  ADD COLUMN IF NOT EXISTS parent_questionnaire_id integer REFERENCES questionnaires(id),
  ADD COLUMN IF NOT EXISTS supersedes_questionnaire_id integer REFERENCES questionnaires(id),
  ADD COLUMN IF NOT EXISTS replaced_by_questionnaire_id integer REFERENCES questionnaires(id),
  ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS immutable_from timestamp with time zone,
  ADD COLUMN IF NOT EXISTS immutable_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS version_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE questionnaires
SET
  parent_questionnaire_id = COALESCE(parent_questionnaire_id, id),
  version_no = COALESCE(NULLIF(version_no, 0), GREATEST(COALESCE(version, 1), 1)),
  immutable_from = CASE
    WHEN authorization_status IN ('AUTHORIZED', 'REJECTED') THEN COALESCE(immutable_from, authorized_at, updated_at, created_at, now())
    ELSE immutable_from
  END,
  immutable_reason = CASE
    WHEN authorization_status = 'AUTHORIZED' THEN COALESCE(immutable_reason, 'AUTHORIZED_RECORD_LOCK')
    WHEN authorization_status = 'REJECTED' THEN COALESCE(immutable_reason, 'REJECTED_RECORD_LOCK')
    ELSE immutable_reason
  END,
  version_history = CASE
    WHEN jsonb_typeof(version_history) = 'array' AND jsonb_array_length(version_history) > 0 THEN version_history
    ELSE jsonb_build_array(jsonb_build_object(
      'action', 'VERSION_BASELINE',
      'at', COALESCE(created_at, now()),
      'questionnaire_id', id,
      'version_no', COALESCE(NULLIF(version_no, 0), GREATEST(COALESCE(version, 1), 1)),
      'status', authorization_status
    ))
  END;

CREATE INDEX IF NOT EXISTS idx_questionnaires_parent
  ON questionnaires(parent_questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_questionnaires_supersedes
  ON questionnaires(supersedes_questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_questionnaires_replaced_by
  ON questionnaires(replaced_by_questionnaire_id);

CREATE INDEX IF NOT EXISTS idx_questionnaires_version_no
  ON questionnaires(version_no);
