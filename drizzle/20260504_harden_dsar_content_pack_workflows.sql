ALTER TABLE content_packs
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_verified_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signature_verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS activation_approval_status text NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS activation_requested_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS activation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_approved_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS activation_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollback_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archival_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE content_packs
SET
  payload_hash = COALESCE(payload_hash, signature_hash, 'MIGRATION_BACKFILL'),
  signature_verification_evidence = CASE
    WHEN signature_verification_evidence IS NULL OR signature_verification_evidence = '{}'::jsonb THEN
      jsonb_build_object('source', 'MIGRATION_BACKFILL', 'stored_hash', signature_hash)
    ELSE signature_verification_evidence
  END,
  archival_evidence = COALESCE(archival_evidence, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS idx_content_packs_activation_approval
  ON content_packs(activation_approval_status, pack_status);

CREATE INDEX IF NOT EXISTS idx_content_packs_signature_verified
  ON content_packs(signature_verified_at);

ALTER TABLE dsar_requests
  ADD COLUMN IF NOT EXISTS response_payload_hash text,
  ADD COLUMN IF NOT EXISTS sla_alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS delivery_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archival_status text NOT NULL DEFAULT 'NOT_ARCHIVED',
  ADD COLUMN IF NOT EXISTS archival_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retention_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dpo_decision_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE dsar_requests
SET
  sla_alerts = COALESCE(sla_alerts, '[]'::jsonb),
  delivery_status = COALESCE(NULLIF(delivery_status, ''), 'PENDING'),
  delivery_evidence = CASE
    WHEN delivery_evidence IS NULL OR delivery_evidence = '{}'::jsonb THEN
      jsonb_build_object('source', 'MIGRATION_BACKFILL')
    ELSE delivery_evidence
  END,
  archival_status = COALESCE(NULLIF(archival_status, ''), 'NOT_ARCHIVED'),
  archival_evidence = COALESCE(archival_evidence, '{}'::jsonb),
  retention_check = COALESCE(retention_check, '{}'::jsonb),
  dpo_decision_evidence = COALESCE(dpo_decision_evidence, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS idx_dsar_requests_delivery_status
  ON dsar_requests(delivery_status);

CREATE INDEX IF NOT EXISTS idx_dsar_requests_archival_status
  ON dsar_requests(archival_status);
