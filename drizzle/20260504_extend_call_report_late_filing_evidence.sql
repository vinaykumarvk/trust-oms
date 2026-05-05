ALTER TABLE call_reports
  ADD COLUMN IF NOT EXISTS late_filing_calendar_key text,
  ADD COLUMN IF NOT EXISTS late_filing_timezone text,
  ADD COLUMN IF NOT EXISTS late_filing_threshold_days integer,
  ADD COLUMN IF NOT EXISTS late_filing_due_date date,
  ADD COLUMN IF NOT EXISTS late_filing_evaluated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS late_filing_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE call_reports
SET
  late_filing_calendar_key = COALESCE(late_filing_calendar_key, 'PSE'),
  late_filing_timezone = COALESCE(late_filing_timezone, 'Asia/Manila'),
  late_filing_threshold_days = COALESCE(late_filing_threshold_days, 5),
  late_filing_evaluated_at = COALESCE(late_filing_evaluated_at, filed_date),
  late_filing_evaluation = CASE
    WHEN late_filing_evaluation <> '{}'::jsonb THEN late_filing_evaluation
    WHEN filed_date IS NOT NULL THEN jsonb_build_object(
      'policy', jsonb_build_object(
        'calendarKey', COALESCE(late_filing_calendar_key, 'PSE'),
        'timezone', COALESCE(late_filing_timezone, 'Asia/Manila'),
        'thresholdBusinessDays', COALESCE(late_filing_threshold_days, 5)
      ),
      'businessDaysElapsed', days_since_meeting,
      'requiresSupervisorApproval', requires_supervisor_approval,
      'source', 'MIGRATION_BACKFILL'
    )
    ELSE '{}'::jsonb
  END;
