CREATE TABLE IF NOT EXISTS external_transfer_messages (
  id serial PRIMARY KEY,
  transfer_id integer NOT NULL REFERENCES transfers(id),
  portfolio_id text NOT NULL REFERENCES portfolios(portfolio_id),
  trust_account_id text REFERENCES trust_accounts(account_id),
  direction text NOT NULL DEFAULT 'OUTBOUND',
  message_type text NOT NULL,
  swift_ref text NOT NULL UNIQUE,
  sender_bic text NOT NULL,
  receiver_bic text NOT NULL,
  external_account text NOT NULL,
  security_id integer NOT NULL REFERENCES securities(id),
  quantity numeric(21, 8) NOT NULL,
  trade_date date NOT NULL,
  settlement_date date NOT NULL,
  message_payload jsonb NOT NULL,
  gateway_status text NOT NULL DEFAULT 'GENERATED',
  custodian_ref text,
  confirmed_at timestamptz,
  confirmed_by integer REFERENCES users(id),
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

CREATE INDEX IF NOT EXISTS idx_external_transfer_messages_transfer
  ON external_transfer_messages(transfer_id);

CREATE INDEX IF NOT EXISTS idx_external_transfer_messages_portfolio
  ON external_transfer_messages(portfolio_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_external_transfer_messages_swift_ref
  ON external_transfer_messages(swift_ref);
