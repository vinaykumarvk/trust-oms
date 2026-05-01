CREATE TABLE IF NOT EXISTS settlement_lifecycle_events (
  id serial PRIMARY KEY,
  settlement_id integer NOT NULL REFERENCES settlement_instructions(id),
  event_type text NOT NULL,
  settlement_mechanism text NOT NULL,
  from_status text,
  to_status text,
  delivery_leg_status text,
  payment_leg_status text,
  external_ref text,
  payload jsonb,
  actor_id integer REFERENCES users(id),
  event_at timestamptz NOT NULL DEFAULT now(),
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

CREATE INDEX IF NOT EXISTS idx_settlement_lifecycle_events_settlement
  ON settlement_lifecycle_events(settlement_id);

CREATE INDEX IF NOT EXISTS idx_settlement_lifecycle_events_type
  ON settlement_lifecycle_events(event_type);
