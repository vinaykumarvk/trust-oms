ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'INSTITUTION',
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS pending_config_value text,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_to timestamptz,
  ADD COLUMN IF NOT EXISTS last_governance_version_id text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE system_config
SET
  approval_status = COALESCE(NULLIF(approval_status, ''), 'APPROVED'),
  scope_type = COALESCE(NULLIF(scope_type, ''), 'INSTITUTION'),
  effective_from = COALESCE(effective_from, created_at, now()),
  approved_at = COALESCE(approved_at, updated_at, created_at, now())
WHERE approval_status IS NULL
   OR scope_type IS NULL
   OR effective_from IS NULL
   OR approved_at IS NULL;

CREATE TABLE IF NOT EXISTS system_config_versions (
  id serial PRIMARY KEY,
  config_version_id text UNIQUE NOT NULL,
  config_id integer REFERENCES system_config(id),
  config_key text NOT NULL,
  scope_type text NOT NULL DEFAULT 'INSTITUTION',
  scope_id text,
  version_number integer NOT NULL,
  previous_value text,
  proposed_value text NOT NULL,
  effective_value text,
  value_type text NOT NULL DEFAULT 'STRING',
  approval_status text NOT NULL DEFAULT 'PENDING',
  change_type text NOT NULL DEFAULT 'UPDATE',
  change_reason text NOT NULL,
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  rollback_of_version_id text,
  diff_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_system_config_versions_id
  ON system_config_versions (config_version_id);

CREATE INDEX IF NOT EXISTS idx_system_config_versions_key_scope
  ON system_config_versions (config_key, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_system_config_versions_status
  ON system_config_versions (approval_status);

CREATE INDEX IF NOT EXISTS idx_system_config_versions_effective
  ON system_config_versions (effective_from, effective_to);

INSERT INTO system_config_versions (
  config_version_id,
  config_id,
  config_key,
  scope_type,
  scope_id,
  version_number,
  previous_value,
  proposed_value,
  effective_value,
  value_type,
  approval_status,
  change_type,
  change_reason,
  submitted_by,
  submitted_at,
  reviewed_by,
  reviewed_at,
  effective_from,
  effective_to,
  diff_payload,
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
  'CFG-' || regexp_replace(upper(config_key), '[^A-Z0-9]+', '_', 'g') || '-V' || lpad(version::text, 4, '0') || '-BACKFILL',
  id,
  config_key,
  scope_type,
  scope_id,
  version,
  NULL,
  config_value,
  config_value,
  value_type,
  'APPROVED',
  'CREATE',
  COALESCE(change_reason, 'Historical system configuration backfill'),
  COALESCE(updated_by, created_by, 'MIGRATION_BACKFILL'),
  COALESCE(updated_at, created_at, now()),
  COALESCE(approved_by::text, updated_by, created_by, 'MIGRATION_BACKFILL'),
  COALESCE(approved_at, updated_at, created_at, now()),
  COALESCE(effective_from, created_at, now()),
  effective_to,
  jsonb_build_object(
    'changed', true,
    'previous_hash', NULL,
    'proposed_hash', md5(config_value),
    'previous_length', NULL,
    'proposed_length', length(config_value)
  ),
  jsonb_build_object(
    'action', 'BACKFILL_APPROVED_BASELINE',
    'config_key', config_key,
    'approval_status', 'APPROVED',
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
FROM system_config sc
WHERE NOT EXISTS (
  SELECT 1
  FROM system_config_versions scv
  WHERE scv.config_key = sc.config_key
);

UPDATE system_config sc
SET last_governance_version_id = scv.config_version_id
FROM system_config_versions scv
WHERE sc.last_governance_version_id IS NULL
  AND scv.config_key = sc.config_key
  AND scv.version_number = sc.version;
