ALTER TYPE breach_notification_status ADD VALUE IF NOT EXISTS 'TRIAGED';
ALTER TYPE breach_notification_status ADD VALUE IF NOT EXISTS 'DATA_SUBJECT_NOTIFIED';

ALTER TABLE breach_notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS npc_notification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS npc_notification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_subject_notification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_subject_notification_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS data_subject_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_subject_notification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS affected_client_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS data_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sensitive_personal_information boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_fraud_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS real_risk_of_serious_harm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playbook_status text NOT NULL DEFAULT 'REPORTED',
  ADD COLUMN IF NOT EXISTS playbook_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS containment_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS containment_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closure_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS sla_alerts jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE breach_notifications
SET
  reported_at = COALESCE(reported_at, detected_at),
  title = COALESCE(title, breach_type || ' incident'),
  npc_notification_required = CASE
    WHEN npc_notified_at IS NOT NULL THEN true
    WHEN breach_type ILIKE '%DATA%' THEN true
    ELSE npc_notification_required
  END,
  data_subject_notification_required = CASE
    WHEN breach_type ILIKE '%DATA%' THEN true
    ELSE data_subject_notification_required
  END,
  data_subject_notification_deadline = CASE
    WHEN data_subject_notification_deadline IS NULL AND (breach_type ILIKE '%DATA%' OR npc_notified_at IS NOT NULL) THEN npc_deadline
    ELSE data_subject_notification_deadline
  END,
  containment_status = CASE
    WHEN breach_status IN ('CONTAINED', 'NPC_NOTIFIED', 'RESOLVED', 'CLOSED') THEN 'CONTAINED'
    ELSE containment_status
  END,
  playbook_status = CASE
    WHEN breach_status = 'CLOSED' THEN 'CLOSED'
    WHEN breach_status = 'RESOLVED' THEN 'RESOLVED'
    WHEN npc_notified_at IS NOT NULL THEN 'NPC_NOTIFIED'
    WHEN breach_status = 'CONTAINED' THEN 'CONTAINED'
    ELSE playbook_status
  END,
  npc_notification_evidence = CASE
    WHEN npc_notified_at IS NOT NULL AND npc_notification_evidence = '{}'::jsonb THEN jsonb_build_object(
      'channel', 'NPC_DBNMS',
      'reference', breach_id,
      'submitted_at', npc_notified_at,
      'backfilled', true
    )
    ELSE npc_notification_evidence
  END,
  risk_assessment = CASE
    WHEN risk_assessment = '{}'::jsonb THEN jsonb_build_object(
      'severity', CASE WHEN affected_count >= 1000 THEN 'HIGH' ELSE 'MEDIUM' END,
      'notification_basis', CASE WHEN breach_type ILIKE '%DATA%' THEN jsonb_build_array('BACKFILLED_DATA_BREACH') ELSE '[]'::jsonb END,
      'assessed_at', COALESCE(reported_at, detected_at),
      'npc_notification_required', CASE WHEN breach_type ILIKE '%DATA%' OR npc_notified_at IS NOT NULL THEN true ELSE false END,
      'data_subject_notification_required', CASE WHEN breach_type ILIKE '%DATA%' THEN true ELSE false END
    )
    ELSE risk_assessment
  END,
  playbook_steps = CASE
    WHEN playbook_steps = '[]'::jsonb THEN jsonb_build_array(
      jsonb_build_object('code', 'TRIAGE', 'label', 'Classify affected data and notification trigger', 'status', 'DONE'),
      jsonb_build_object('code', 'CONTAINMENT', 'label', 'Contain unauthorized access and preserve evidence', 'status', CASE WHEN breach_status IN ('CONTAINED', 'NPC_NOTIFIED', 'RESOLVED', 'CLOSED') THEN 'DONE' ELSE 'PENDING' END),
      jsonb_build_object('code', 'NPC_NOTIFICATION', 'label', 'Submit NPC breach notification package', 'status', CASE WHEN npc_notified_at IS NOT NULL THEN 'DONE' WHEN breach_type ILIKE '%DATA%' THEN 'PENDING' ELSE 'NOT_REQUIRED' END, 'due_at', npc_deadline),
      jsonb_build_object('code', 'DATA_SUBJECT_NOTIFICATION', 'label', 'Notify affected data subjects with assistance instructions', 'status', CASE WHEN breach_type ILIKE '%DATA%' THEN 'PENDING' ELSE 'NOT_REQUIRED' END, 'due_at', CASE WHEN breach_type ILIKE '%DATA%' THEN npc_deadline ELSE NULL END),
      jsonb_build_object('code', 'REMEDIATION', 'label', 'Complete root-cause fix and residual-risk review', 'status', CASE WHEN breach_status IN ('RESOLVED', 'CLOSED') THEN 'DONE' ELSE 'PENDING' END),
      jsonb_build_object('code', 'CLOSURE', 'label', 'DPO closure approval with evidence', 'status', CASE WHEN breach_status = 'CLOSED' THEN 'DONE' ELSE 'PENDING' END)
    )
    ELSE playbook_steps
  END,
  status_history = CASE
    WHEN status_history = '[]'::jsonb THEN jsonb_build_array(
      jsonb_build_object('action', 'MIGRATION_BACKFILL', 'status', breach_status, 'created_at', COALESCE(reported_at, detected_at))
    )
    ELSE status_history
  END;

CREATE INDEX IF NOT EXISTS breach_notifications_status_idx
  ON breach_notifications (breach_status);

CREATE INDEX IF NOT EXISTS breach_notifications_playbook_status_idx
  ON breach_notifications (playbook_status);

CREATE INDEX IF NOT EXISTS breach_notifications_npc_deadline_idx
  ON breach_notifications (npc_deadline);

CREATE INDEX IF NOT EXISTS breach_notifications_data_subject_deadline_idx
  ON breach_notifications (data_subject_notification_deadline);
