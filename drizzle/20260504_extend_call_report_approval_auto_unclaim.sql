ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS calendar_key text NOT NULL DEFAULT 'PSE',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Manila';

ALTER TABLE call_report_approvals
  ALTER COLUMN supervisor_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS claim_calendar_key text,
  ADD COLUMN IF NOT EXISTS claim_timezone text,
  ADD COLUMN IF NOT EXISTS claim_expires_on date,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_unclaim_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_auto_unclaimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_unclaim_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS claim_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE call_report_approvals cra
SET
  claim_calendar_key = COALESCE(cra.claim_calendar_key, b.calendar_key, 'PSE'),
  claim_timezone = COALESCE(cra.claim_timezone, b.timezone, 'Asia/Manila'),
  auto_unclaim_evidence = CASE
    WHEN cra.auto_unclaim_evidence IS NULL OR cra.auto_unclaim_evidence = '{}'::jsonb THEN
      jsonb_build_object(
        'source', 'MIGRATION_BACKFILL',
        'policy', jsonb_build_object(
          'calendarKey', COALESCE(cra.claim_calendar_key, b.calendar_key, 'PSE'),
          'timezone', COALESCE(cra.claim_timezone, b.timezone, 'Asia/Manila'),
          'thresholdBusinessDays', 2
        )
      )
    ELSE cra.auto_unclaim_evidence
  END
FROM call_reports cr
LEFT JOIN branches b ON b.id = cr.branch_id
WHERE cra.call_report_id = cr.id;

UPDATE call_report_approvals
SET supervisor_id = NULL
WHERE action = 'PENDING' AND claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS call_report_approvals_claim_expiry_idx
  ON call_report_approvals (action, claim_expires_on, claimed_at)
  WHERE action = 'CLAIMED';

CREATE INDEX IF NOT EXISTS call_report_approvals_auto_unclaim_idx
  ON call_report_approvals (last_auto_unclaimed_at)
  WHERE auto_unclaim_count > 0;
