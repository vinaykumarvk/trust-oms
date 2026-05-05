-- Corporate action entitlement/election reconciliation source legs.

CREATE TABLE IF NOT EXISTS corporate_action_custody_confirmations (
  id serial PRIMARY KEY,
  corporate_action_id integer NOT NULL REFERENCES corporate_actions(id),
  portfolio_id text NOT NULL REFERENCES portfolios(portfolio_id),
  custody_source text NOT NULL,
  custody_account_ref text,
  entitled_qty numeric,
  elected_option text,
  cash_amount numeric,
  posted_qty numeric,
  confirmation_status text NOT NULL DEFAULT 'RECEIVED',
  source_message_id integer,
  as_of_date date NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  updated_by text,
  is_deleted boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ca_custody_confirmations_event
  ON corporate_action_custody_confirmations(corporate_action_id);

CREATE INDEX IF NOT EXISTS idx_ca_custody_confirmations_portfolio
  ON corporate_action_custody_confirmations(portfolio_id);

CREATE TABLE IF NOT EXISTS corporate_action_statement_lines (
  id serial PRIMARY KEY,
  corporate_action_id integer NOT NULL REFERENCES corporate_actions(id),
  portfolio_id text NOT NULL REFERENCES portfolios(portfolio_id),
  client_id text REFERENCES clients(client_id),
  statement_id integer,
  entitled_qty numeric,
  elected_option text,
  cash_amount numeric,
  line_payload jsonb,
  as_of_date date NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  updated_by text,
  is_deleted boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ca_statement_lines_event
  ON corporate_action_statement_lines(corporate_action_id);

CREATE INDEX IF NOT EXISTS idx_ca_statement_lines_portfolio
  ON corporate_action_statement_lines(portfolio_id);

DO $$
BEGIN
  IF to_regclass('public.corporate_action_feed_messages') IS NOT NULL
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
