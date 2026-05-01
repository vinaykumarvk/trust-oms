DO $$ BEGIN
  CREATE TYPE trust_account_status AS ENUM ('DRAFT', 'PENDING_DOCUMENTS', 'ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trust_sub_account_status AS ENUM ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trust_holding_account_type AS ENUM ('CASH', 'SECURITIES', 'FEES', 'INCOME', 'SETTLEMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trust_settlement_account_purpose AS ENUM ('TSA', 'CSA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trust_related_party_type AS ENUM (
    'SETTLOR', 'BENEFICIARY', 'TRUSTEE', 'CO_TRUSTEE', 'AUTHORIZED_SIGNATORY',
    'UBO', 'GUARDIAN', 'PROTECTOR', 'RELATED_ENTITY', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trust_mandate_type AS ENUM ('DISCRETIONARY', 'DIRECTED', 'SAFEKEEPING', 'ESCROW', 'AGENCY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS trust_accounts (
  account_id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(client_id),
  primary_portfolio_id text REFERENCES portfolios(portfolio_id),
  product_type trust_product_type NOT NULL,
  account_name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'PHP',
  account_status trust_account_status NOT NULL DEFAULT 'DRAFT',
  branch_id integer REFERENCES branches(id),
  assigned_rm_id integer REFERENCES users(id),
  onboarding_reference_type text,
  onboarding_reference_id text,
  opened_at timestamptz,
  closed_at timestamptz,
  risk_profile_snapshot jsonb,
  related_party_policy jsonb,
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

CREATE INDEX IF NOT EXISTS idx_trust_accounts_client ON trust_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_trust_accounts_portfolio ON trust_accounts(primary_portfolio_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_trust_accounts_onboarding_ref
  ON trust_accounts(onboarding_reference_type, onboarding_reference_id)
  WHERE onboarding_reference_type IS NOT NULL AND onboarding_reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trust_holding_accounts (
  account_id text PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  account_no text NOT NULL UNIQUE,
  account_type trust_holding_account_type NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  account_status trust_sub_account_status NOT NULL DEFAULT 'PENDING_SETUP',
  balance_snapshot numeric(21,4) DEFAULT 0,
  available_balance_snapshot numeric(21,4) DEFAULT 0,
  opened_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_trust_holding_accounts_trust ON trust_holding_accounts(trust_account_id);
CREATE INDEX IF NOT EXISTS idx_trust_holding_accounts_portfolio ON trust_holding_accounts(portfolio_id);

CREATE TABLE IF NOT EXISTS trust_security_accounts (
  account_id text PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  custodian_id integer REFERENCES counterparties(id),
  depository text,
  account_no text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'PHP',
  account_status trust_sub_account_status NOT NULL DEFAULT 'PENDING_SETUP',
  opened_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_trust_security_accounts_trust ON trust_security_accounts(trust_account_id);
CREATE INDEX IF NOT EXISTS idx_trust_security_accounts_portfolio ON trust_security_accounts(portfolio_id);

CREATE TABLE IF NOT EXISTS trust_settlement_accounts (
  account_id text PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  purpose trust_settlement_account_purpose NOT NULL,
  account_level text NOT NULL DEFAULT 'PORTFOLIO',
  account_no text NOT NULL UNIQUE,
  account_name text NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  bank_name text,
  routing_bic text,
  is_default boolean NOT NULL DEFAULT false,
  account_status trust_sub_account_status NOT NULL DEFAULT 'PENDING_SETUP',
  opened_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_trust_settlement_accounts_trust ON trust_settlement_accounts(trust_account_id);
CREATE INDEX IF NOT EXISTS idx_trust_settlement_accounts_portfolio ON trust_settlement_accounts(portfolio_id);

CREATE TABLE IF NOT EXISTS trust_mandates (
  id serial PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  mandate_type trust_mandate_type NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  investment_authority text,
  signing_rule jsonb,
  risk_limits jsonb,
  document_reference text,
  mandate_status text NOT NULL DEFAULT 'ACTIVE',
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

CREATE INDEX IF NOT EXISTS idx_trust_mandates_trust ON trust_mandates(trust_account_id);
CREATE INDEX IF NOT EXISTS idx_trust_mandates_portfolio ON trust_mandates(portfolio_id);

CREATE TABLE IF NOT EXISTS trust_related_parties (
  id serial PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  client_id text REFERENCES clients(client_id),
  party_type trust_related_party_type NOT NULL,
  legal_name text NOT NULL,
  ownership_pct numeric(9,4),
  authority_scope jsonb,
  signing_limit numeric(21,4),
  is_ubo boolean NOT NULL DEFAULT false,
  is_authorized_signatory boolean NOT NULL DEFAULT false,
  kyc_status kyc_status DEFAULT 'PENDING',
  screening_status text DEFAULT 'PENDING',
  effective_from date,
  effective_to date,
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

CREATE INDEX IF NOT EXISTS idx_trust_related_parties_trust ON trust_related_parties(trust_account_id);
CREATE INDEX IF NOT EXISTS idx_trust_related_parties_client ON trust_related_parties(client_id);

CREATE TABLE IF NOT EXISTS trust_account_foundation_events (
  id serial PRIMARY KEY,
  trust_account_id text NOT NULL REFERENCES trust_accounts(account_id),
  event_type text NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_trust_account_foundation_events_trust
  ON trust_account_foundation_events(trust_account_id);
