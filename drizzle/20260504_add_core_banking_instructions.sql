-- Trust Banking core-banking adapter instruction ledger.

CREATE TABLE IF NOT EXISTS core_banking_instructions (
  id serial PRIMARY KEY,
  instruction_id text NOT NULL UNIQUE,
  target_system text NOT NULL,
  adapter_id text,
  operation text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  owner_team text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  instruction_status text NOT NULL DEFAULT 'QUEUED',
  ack_status text NOT NULL DEFAULT 'PENDING',
  external_reference text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  exception_id integer REFERENCES exception_items(id),
  last_error text,
  correlation_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  updated_by text,
  is_deleted boolean DEFAULT false NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_core_banking_instruction_id
  ON core_banking_instructions(instruction_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_core_banking_instruction_idempotency
  ON core_banking_instructions(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_core_banking_instruction_status
  ON core_banking_instructions(instruction_status, ack_status);

CREATE INDEX IF NOT EXISTS idx_core_banking_instruction_entity
  ON core_banking_instructions(entity_type, entity_id);

DO $$
BEGIN
  IF to_regclass('public.oems_integration_adapters') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'core_banking_instructions'
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (adapter_id) REFERENCES oems_integration_adapters(adapter_id)%'
    )
  THEN
    ALTER TABLE core_banking_instructions
      ADD CONSTRAINT core_banking_instructions_adapter_id_fkey
      FOREIGN KEY (adapter_id) REFERENCES oems_integration_adapters(adapter_id);
  END IF;
END $$;
