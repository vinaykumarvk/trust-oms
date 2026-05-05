-- Corporate action external feed ingestion boundary.

CREATE TABLE IF NOT EXISTS corporate_action_feed_messages (
  id serial PRIMARY KEY,
  feed_message_id text NOT NULL UNIQUE,
  source_system text NOT NULL,
  feed_format text NOT NULL,
  external_event_id text,
  external_security_id text,
  payload_hash text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  raw_payload jsonb NOT NULL,
  normalized_payload jsonb,
  parse_status text NOT NULL DEFAULT 'RECEIVED',
  validation_errors jsonb DEFAULT '[]'::jsonb,
  corporate_action_id integer REFERENCES corporate_actions(id),
  replay_count integer NOT NULL DEFAULT 0,
  last_replayed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  parsed_at timestamptz,
  ingested_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  updated_by text,
  is_deleted boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ca_feed_messages_source
  ON corporate_action_feed_messages(source_system, feed_format);

CREATE INDEX IF NOT EXISTS idx_ca_feed_messages_status
  ON corporate_action_feed_messages(parse_status);

CREATE INDEX IF NOT EXISTS idx_ca_feed_messages_ca
  ON corporate_action_feed_messages(corporate_action_id);

DO $$
BEGIN
  IF to_regclass('public.corporate_action_custody_confirmations') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'corporate_action_custody_confirmations'
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (source_message_id) REFERENCES corporate_action_feed_messages(id)%'
    )
  THEN
    ALTER TABLE corporate_action_custody_confirmations
      ADD CONSTRAINT corporate_action_custody_confirmations_source_message_id_fkey
      FOREIGN KEY (source_message_id) REFERENCES corporate_action_feed_messages(id);
  END IF;
END $$;
