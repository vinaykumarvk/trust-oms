ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'AWAITING_INCOMING',
  ADD COLUMN IF NOT EXISTS matched_item_id integer,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS matched_by text,
  ADD COLUMN IF NOT EXISTS match_confidence numeric(9, 6),
  ADD COLUMN IF NOT EXISTS match_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unmatched_reason text,
  ADD COLUMN IF NOT EXISTS exception_id integer REFERENCES exception_items(id);

CREATE TABLE IF NOT EXISTS contribution_match_items (
  id serial PRIMARY KEY,
  item_type text NOT NULL DEFAULT 'CASH',
  portfolio_id text REFERENCES portfolios(portfolio_id),
  trust_account_id text REFERENCES trust_accounts(account_id),
  currency text,
  amount numeric(21, 4),
  security_id integer REFERENCES securities(id),
  quantity numeric(21, 8),
  source_account text,
  external_reference text NOT NULL,
  source_system text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  value_date date,
  match_status text NOT NULL DEFAULT 'UNMATCHED',
  matched_contribution_id integer REFERENCES contributions(id),
  matched_at timestamptz,
  matched_by text,
  match_confidence numeric(9, 6),
  match_method text,
  match_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  investigation_owner text,
  investigation_notes text,
  resolved_at timestamptz,
  resolution_code text,
  resolution_evidence jsonb,
  exception_id integer REFERENCES exception_items(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text
);

CREATE INDEX IF NOT EXISTS idx_contribution_match_items_status
  ON contribution_match_items(match_status, received_at);

CREATE INDEX IF NOT EXISTS idx_contribution_match_items_portfolio
  ON contribution_match_items(portfolio_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contribution_match_items_external_ref
  ON contribution_match_items(source_system, external_reference);

CREATE INDEX IF NOT EXISTS idx_contributions_match_status
  ON contributions(match_status, portfolio_id);
