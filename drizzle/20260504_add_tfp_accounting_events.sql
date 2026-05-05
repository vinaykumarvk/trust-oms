CREATE TABLE IF NOT EXISTS tfp_accounting_events (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL UNIQUE,
  source_transaction_type text NOT NULL,
  source_transaction_id text NOT NULL,
  source_event_id text,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  customer_id text,
  portfolio_id text,
  fee_plan_id integer REFERENCES fee_plans(id),
  accrual_id integer REFERENCES tfp_accruals(id),
  invoice_id integer REFERENCES tfp_invoices(id),
  amount numeric(21,4) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  accounting_date date NOT NULL,
  event_payload jsonb NOT NULL,
  publish_status text NOT NULL DEFAULT 'PENDING',
  acknowledgement_status text NOT NULL DEFAULT 'UNACKNOWLEDGED',
  acknowledgement_ref text,
  acknowledgement_payload jsonb,
  published_at timestamptz,
  acknowledged_at timestamptz,
  replay_count integer NOT NULL DEFAULT 0,
  last_replayed_at timestamptz,
  failure_reason text,
  next_retry_at timestamptz,
  exception_id integer REFERENCES exception_items(id),
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_tfp_accounting_events_idempotency
  ON tfp_accounting_events(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_tfp_accounting_events_source
  ON tfp_accounting_events(source_transaction_type, source_transaction_id);

CREATE INDEX IF NOT EXISTS idx_tfp_accounting_events_status
  ON tfp_accounting_events(publish_status, acknowledgement_status);

DO $$
BEGIN
  IF to_regclass('public.domain_events') IS NOT NULL THEN
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
