CREATE TABLE IF NOT EXISTS domain_events (
  id serial PRIMARY KEY,
  domain_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  source_system text NOT NULL,
  source_reference text,
  idempotency_key text UNIQUE NOT NULL,
  event_correlation_id text,
  causation_id text,
  parent_event_id text,
  payload_hash text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_status text NOT NULL DEFAULT 'RECORDED',
  replay_status text NOT NULL DEFAULT 'NOT_REQUESTED',
  duplicate_count integer NOT NULL DEFAULT 0,
  replay_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_duplicate_at timestamptz,
  last_replayed_at timestamptz,
  replay_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason text,
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

CREATE TABLE IF NOT EXISTS domain_event_replay_requests (
  id serial PRIMARY KEY,
  replay_request_id text UNIQUE NOT NULL,
  domain_event_id text NOT NULL REFERENCES domain_events(domain_event_id),
  replay_reason text NOT NULL,
  replay_status text NOT NULL DEFAULT 'PENDING',
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_domain_events_idempotency
  ON domain_events (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_domain_events_event_id
  ON domain_events (domain_event_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON domain_events (aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_type_status
  ON domain_events (event_type, event_status);

CREATE INDEX IF NOT EXISTS idx_domain_events_replay_status
  ON domain_events (replay_status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_domain_event_replay_request_id
  ON domain_event_replay_requests (replay_request_id);

CREATE INDEX IF NOT EXISTS idx_domain_event_replays_event
  ON domain_event_replay_requests (domain_event_id);

CREATE INDEX IF NOT EXISTS idx_domain_event_replays_status
  ON domain_event_replay_requests (replay_status);

DO $$
BEGIN
  IF to_regclass('public.tfp_accounting_events') IS NOT NULL THEN
    EXECUTE $backfill$
      INSERT INTO domain_events (
        domain_event_id,
        event_type,
        schema_version,
        aggregate_type,
        aggregate_id,
        source_system,
        source_reference,
        idempotency_key,
        payload_hash,
        event_payload,
        event_status,
        replay_status,
        first_seen_at,
        last_seen_at,
        created_by,
        updated_by
      )
      SELECT
        'DE-TFP-' || id::text,
        event_type,
        schema_version,
        aggregate_type,
        aggregate_id,
        'TRUSTFEES_PRO',
        source_transaction_type || ':' || source_transaction_id,
        idempotency_key,
        md5(event_payload::text),
        event_payload,
        publish_status,
        CASE WHEN replay_count > 0 THEN 'COMPLETED' ELSE 'NOT_REQUESTED' END,
        created_at,
        updated_at,
        'MIGRATION_BACKFILL',
        'MIGRATION_BACKFILL'
      FROM tfp_accounting_events
      ON CONFLICT (idempotency_key) DO NOTHING
    $backfill$;
  END IF;
END $$;
