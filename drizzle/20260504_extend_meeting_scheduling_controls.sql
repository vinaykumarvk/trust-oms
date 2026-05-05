ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS calendar_key text NOT NULL DEFAULT 'PSE',
  ADD COLUMN IF NOT EXISTS scheduling_validation_status text NOT NULL DEFAULT 'PASSED',
  ADD COLUMN IF NOT EXISTS scheduling_conflict_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS scheduling_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduling_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduling_validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS market_holiday_warning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS market_holiday_name text;

UPDATE meetings
SET
  calendar_key = COALESCE(NULLIF(calendar_key, ''), 'PSE'),
  scheduling_validation_status = COALESCE(NULLIF(scheduling_validation_status, ''), 'PASSED'),
  scheduling_conflict_status = COALESCE(NULLIF(scheduling_conflict_status, ''), 'NONE'),
  scheduling_conflicts = COALESCE(scheduling_conflicts, '[]'::jsonb),
  scheduling_warnings = COALESCE(scheduling_warnings, '[]'::jsonb),
  scheduling_validation_evidence = CASE
    WHEN scheduling_validation_evidence IS NULL OR scheduling_validation_evidence = '{}'::jsonb THEN
      jsonb_build_object(
        'source', 'MIGRATION_BACKFILL',
        'calendarKey', COALESCE(NULLIF(calendar_key, ''), 'PSE'),
        'validationStatus', COALESCE(NULLIF(scheduling_validation_status, ''), 'PASSED'),
        'conflictStatus', COALESCE(NULLIF(scheduling_conflict_status, ''), 'NONE'),
        'evaluatedAt', now()
      )
    ELSE scheduling_validation_evidence
  END;

CREATE INDEX IF NOT EXISTS meetings_scheduling_window_idx
  ON meetings (organizer_user_id, meeting_status, start_time, end_time)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS meetings_market_holiday_warning_idx
  ON meetings (market_holiday_warning)
  WHERE market_holiday_warning = true AND is_deleted = false;
