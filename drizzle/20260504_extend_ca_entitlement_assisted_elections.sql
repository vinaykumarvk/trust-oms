ALTER TABLE corporate_action_entitlements
  ADD COLUMN IF NOT EXISTS election_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS election_channel text,
  ADD COLUMN IF NOT EXISTS assisted_by_user_id text,
  ADD COLUMN IF NOT EXISTS branch_code text,
  ADD COLUMN IF NOT EXISTS election_captured_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS election_captured_by text,
  ADD COLUMN IF NOT EXISTS maker_user_id text,
  ADD COLUMN IF NOT EXISTS checker_user_id text,
  ADD COLUMN IF NOT EXISTS maker_checker_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS authority_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS authority_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS authority_verified_by text,
  ADD COLUMN IF NOT EXISTS election_capture_notes text,
  ADD COLUMN IF NOT EXISTS election_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE corporate_action_entitlements
SET
  election_status = CASE WHEN elected_option IS NULL THEN 'PENDING' ELSE 'SUBMITTED' END,
  election_channel = CASE WHEN elected_option IS NULL THEN election_channel ELSE COALESCE(election_channel, 'SYSTEM') END,
  election_captured_at = CASE WHEN elected_option IS NULL THEN election_captured_at ELSE COALESCE(election_captured_at, updated_at) END,
  election_captured_by = CASE WHEN elected_option IS NULL THEN election_captured_by ELSE COALESCE(election_captured_by, updated_by) END,
  maker_checker_status = CASE WHEN elected_option IS NULL THEN maker_checker_status ELSE COALESCE(NULLIF(maker_checker_status, ''), 'NOT_REQUIRED') END,
  authority_evidence = COALESCE(authority_evidence, '{}'::jsonb),
  election_history = CASE
    WHEN jsonb_typeof(election_history) = 'array' AND jsonb_array_length(election_history) > 0 THEN election_history
    WHEN elected_option IS NOT NULL THEN jsonb_build_array(jsonb_build_object(
      'action', 'ELECTION_CAPTURED',
      'option', elected_option,
      'channel', COALESCE(election_channel, 'SYSTEM'),
      'at', COALESCE(election_captured_at, updated_at),
      'captured_by_user_id', COALESCE(election_captured_by, updated_by),
      'assisted_by_user_id', assisted_by_user_id,
      'branch_code', branch_code,
      'maker_user_id', maker_user_id,
      'checker_user_id', checker_user_id,
      'maker_checker_status', COALESCE(NULLIF(maker_checker_status, ''), 'NOT_REQUIRED'),
      'authority_evidence', COALESCE(authority_evidence, '{}'::jsonb)
    ))
    ELSE '[]'::jsonb
  END;

CREATE INDEX IF NOT EXISTS corporate_action_entitlements_election_status_idx
  ON corporate_action_entitlements(election_status);

CREATE INDEX IF NOT EXISTS corporate_action_entitlements_election_channel_idx
  ON corporate_action_entitlements(election_channel);
