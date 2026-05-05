ALTER TABLE form1601fq
  ADD COLUMN IF NOT EXISTS efps_submission_id text,
  ADD COLUMN IF NOT EXISTS efps_channel text DEFAULT 'EFPS',
  ADD COLUMN IF NOT EXISTS authority_status text DEFAULT 'NOT_SUBMITTED',
  ADD COLUMN IF NOT EXISTS authority_reference text,
  ADD COLUMN IF NOT EXISTS authority_acknowledgement_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submission_payload_hash text,
  ADD COLUMN IF NOT EXISTS submission_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_submission_error text,
  ADD COLUMN IF NOT EXISTS authority_evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS tax_authority_submissions (
  id serial PRIMARY KEY,
  submission_id text UNIQUE NOT NULL,
  form1601fq_id integer REFERENCES form1601fq(id),
  tax_form_type text NOT NULL,
  authority_code text NOT NULL DEFAULT 'BIR',
  channel text NOT NULL DEFAULT 'EFPS',
  submission_mode text NOT NULL DEFAULT 'MANUAL_EVIDENCE',
  period_key text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  payload_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  authority_reference text,
  submission_status text NOT NULL DEFAULT 'SUBMITTED',
  acknowledgement_status text NOT NULL DEFAULT 'PENDING',
  acknowledgement_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  next_retry_at timestamptz,
  last_error text,
  retry_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_authority_submission_id
  ON tax_authority_submissions (submission_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_authority_idempotency
  ON tax_authority_submissions (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_tax_authority_form1601fq
  ON tax_authority_submissions (form1601fq_id);

CREATE INDEX IF NOT EXISTS idx_tax_authority_status
  ON tax_authority_submissions (submission_status, acknowledgement_status);

CREATE INDEX IF NOT EXISTS idx_tax_authority_retry
  ON tax_authority_submissions (next_retry_at);

INSERT INTO tax_authority_submissions (
  submission_id,
  form1601fq_id,
  tax_form_type,
  authority_code,
  channel,
  submission_mode,
  period_key,
  idempotency_key,
  payload_hash,
  request_payload,
  response_payload,
  authority_reference,
  submission_status,
  acknowledgement_status,
  acknowledgement_payload,
  attempt_count,
  submitted_by,
  submitted_at,
  acknowledged_at,
  evidence_payload,
  created_at,
  created_by,
  updated_at,
  updated_by,
  version,
  status,
  is_deleted,
  tenant_id,
  correlation_id,
  audit_hash
)
SELECT
  COALESCE(efps_submission_id, 'TAX-BIR-1601FQ-Q' || quarter::text || '-' || year::text || '-' || id::text || '-BACKFILL'),
  id,
  '1601FQ',
  'BIR',
  COALESCE(efps_channel, 'EFPS'),
  'MANUAL_EVIDENCE',
  year::text || '-Q' || quarter::text,
  md5(COALESCE(xml_payload, '') || ':' || id::text || ':' || quarter::text || ':' || year::text),
  COALESCE(submission_payload_hash, md5(COALESCE(xml_payload, ''))),
  jsonb_build_object(
    'form_type', '1601FQ',
    'period_key', year::text || '-Q' || quarter::text,
    'filing_id', id,
    'payload_hash', COALESCE(submission_payload_hash, md5(COALESCE(xml_payload, '')))
  ),
  COALESCE(authority_acknowledgement_payload, '{}'::jsonb),
  authority_reference,
  COALESCE(NULLIF(authority_status, ''), filing_status, 'SUBMITTED'),
  CASE
    WHEN authority_reference IS NOT NULL THEN 'ACCEPTED'
    WHEN authority_status IN ('REJECTED', 'FAILED') THEN authority_status
    ELSE 'PENDING'
  END,
  COALESCE(authority_acknowledgement_payload, '{}'::jsonb),
  GREATEST(COALESCE(submission_attempt_count, 1), 1),
  COALESCE(updated_by, created_by, 'MIGRATION_BACKFILL'),
  COALESCE(last_submitted_at, updated_at, created_at, now()),
  CASE WHEN authority_reference IS NOT NULL THEN COALESCE(updated_at, created_at, now()) ELSE NULL END,
  jsonb_build_object(
    'action', 'BACKFILL_TAX_AUTHORITY_SUBMISSION',
    'authority_reference', authority_reference,
    'authority_status', COALESCE(authority_status, filing_status),
    'occurred_at', COALESCE(updated_at, created_at, now())
  ),
  created_at,
  created_by,
  updated_at,
  updated_by,
  version,
  status,
  is_deleted,
  tenant_id,
  correlation_id,
  audit_hash
FROM form1601fq f
WHERE filing_status IN ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'FAILED')
  AND NOT EXISTS (
    SELECT 1
    FROM tax_authority_submissions tas
    WHERE tas.form1601fq_id = f.id
  );
