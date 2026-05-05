BEGIN;

ALTER TABLE oems_integration_adapters
  ADD COLUMN IF NOT EXISTS require_tls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowed_address_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_source_cidrs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_classification text NOT NULL DEFAULT 'CONFIDENTIAL',
  ADD COLUMN IF NOT EXISTS sensitive_field_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS encrypted_field_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mask_log_payloads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS encryption_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_profile_ref text,
  ADD COLUMN IF NOT EXISTS transport_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS security_policy_status text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE oems_integration_adapter_executions
  ADD COLUMN IF NOT EXISTS source_address text,
  ADD COLUMN IF NOT EXISTS destination_address text,
  ADD COLUMN IF NOT EXISTS security_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_payload_masked jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_payload_masked jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_profile_ref text;

ALTER TABLE oems_wealth_lending_facilities
  ADD COLUMN IF NOT EXISTS loan_system_ref text,
  ADD COLUMN IF NOT EXISTS core_banking_ref text,
  ADD COLUMN IF NOT EXISTS loan_account_no text,
  ADD COLUMN IF NOT EXISTS dbank_visibility_status text NOT NULL DEFAULT 'NOT_PUBLISHED',
  ADD COLUMN IF NOT EXISTS sales_visibility_status text NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN IF NOT EXISTS limit_update_status text NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS overdraft_block_status text NOT NULL DEFAULT 'NOT_BLOCKED',
  ADD COLUMN IF NOT EXISTS cure_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS cure_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS repayment_required numeric(21,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_up_required numeric(21,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collateral_decrease_percent numeric(9,6),
  ADD COLUMN IF NOT EXISTS cure_period_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_price_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outstanding_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS defaulted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_oems_lending_cure
  ON oems_wealth_lending_facilities(cure_status, cure_due_at);

ALTER TABLE oems_wealth_lending_collaterals
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS last_price numeric(21,8),
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS stale_price_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_tolerance_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS maturity_date date,
  ADD COLUMN IF NOT EXISTS last_price_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_oems_collateral_price
  ON oems_wealth_lending_collaterals(product_code, price_status);

ALTER TABLE oems_m2m_runs
  ADD COLUMN IF NOT EXISTS overdraft_limit_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS repayment_required numeric(21,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_up_required numeric(21,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cure_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS cure_due_at timestamptz;

CREATE TABLE IF NOT EXISTS oems_wealth_lending_market_prices (
  id serial PRIMARY KEY,
  price_id text NOT NULL UNIQUE,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  collateral_id integer REFERENCES oems_wealth_lending_collaterals(id),
  product_family oems_product_family NOT NULL,
  product_code text NOT NULL,
  source_system text NOT NULL,
  market_price numeric(21,8),
  market_value numeric(21,4),
  price_date date NOT NULL,
  price_status text NOT NULL DEFAULT 'AVAILABLE',
  stale_used boolean NOT NULL DEFAULT false,
  stale_until date,
  failure_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_lending_prices_facility
  ON oems_wealth_lending_market_prices(facility_id, price_date);
CREATE INDEX IF NOT EXISTS idx_oems_lending_prices_product
  ON oems_wealth_lending_market_prices(product_code, source_system);
CREATE INDEX IF NOT EXISTS idx_oems_lending_prices_status
  ON oems_wealth_lending_market_prices(price_status);

CREATE TABLE IF NOT EXISTS oems_wealth_lending_outstanding_snapshots (
  id serial PRIMARY KEY,
  snapshot_id text NOT NULL UNIQUE,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  source_system text NOT NULL,
  loan_account_no text,
  outstanding_amount numeric(21,4),
  limit_amount numeric(21,4),
  retrieval_status text NOT NULL DEFAULT 'AVAILABLE',
  as_of_date date NOT NULL,
  failure_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_lending_outstanding_facility
  ON oems_wealth_lending_outstanding_snapshots(facility_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_oems_lending_outstanding_status
  ON oems_wealth_lending_outstanding_snapshots(retrieval_status);

CREATE TABLE IF NOT EXISTS oems_wealth_lending_instructions (
  id serial PRIMARY KEY,
  instruction_id text NOT NULL UNIQUE,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  instruction_type text NOT NULL,
  target_system text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  instruction_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  amount numeric(21,4),
  currency text NOT NULL DEFAULT 'IDR',
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_lending_instructions_facility
  ON oems_wealth_lending_instructions(facility_id, instruction_type);
CREATE INDEX IF NOT EXISTS idx_oems_lending_instructions_status
  ON oems_wealth_lending_instructions(instruction_status);

CREATE TABLE IF NOT EXISTS oems_wealth_lending_cure_actions (
  id serial PRIMARY KEY,
  action_id text NOT NULL UNIQUE,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  action_type text NOT NULL,
  action_status text NOT NULL DEFAULT 'RECORDED',
  amount numeric(21,4),
  collateral_market_value numeric(21,4),
  resulting_outstanding_amount numeric(21,4),
  resulting_ltv numeric(9,6),
  cure_due_at timestamptz,
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_lending_cure_facility
  ON oems_wealth_lending_cure_actions(facility_id, action_status);

UPDATE oems_integration_adapters
SET
  require_tls = true,
  mask_log_payloads = true,
  encryption_required = target_system IN ('NCBS', 'RBS', 'AVANTRADE', 'WEALTH_CORE', 'DBANK_PRO'),
  encryption_profile_ref = COALESCE(encryption_profile_ref, auth_profile_ref, 'vault://oems/default'),
  allowed_address_patterns = CASE
    WHEN target_system IN ('RBS', 'AVANTRADE', 'WEALTH_CORE', 'NCBS') THEN '["/integrations/*","*.danamon.internal"]'::jsonb
    ELSE '["/integrations/*"]'::jsonb
  END,
  sensitive_field_paths = '["customerId","cif","accountNo","account_no","debitAccountNo","creditAccountNo","loanAccountNo","idNumber","email","phone","payload.customerId","payload.cif"]'::jsonb,
  encrypted_field_paths = '["request_payload","response_payload"]'::jsonb,
  transport_policy = '{"requireTls":true,"allowInternalPaths":true,"addressFiltering":"ENFORCED"}'::jsonb,
  security_policy_status = 'ACTIVE',
  updated_at = now(),
  updated_by = 'migration'
WHERE is_deleted = false;

COMMIT;
