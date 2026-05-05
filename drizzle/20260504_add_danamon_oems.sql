DO $$ BEGIN
  CREATE TYPE oems_product_family AS ENUM ('ODA', 'MLD', 'MUTUAL_FUND', 'BOND', 'FX_TODAY', 'WEALTH_LENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_channel AS ENUM ('BRANCH', 'CRM', 'RM_MOBILE', 'SECURE_MICROSITE', 'BACK_OFFICE', 'TREASURY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_order_status AS ENUM (
    'DRAFT', 'VALIDATION_FAILED', 'PENDING_DOCUMENTS', 'PENDING_CUSTOMER_CONFIRMATION',
    'PENDING_APPROVAL', 'APPROVED', 'COLLECTED', 'PLACED', 'OBSERVATION', 'EXECUTED',
    'BOOKED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'MATURED', 'SETTLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_parameter_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_validation_severity AS ENUM ('INFO', 'WARNING', 'BLOCKING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_validation_result AS ENUM ('PASS', 'WARN', 'FAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_integration_status AS ENUM ('QUEUED', 'SENT', 'ACKNOWLEDGED', 'FAILED', 'RETRYING', 'RECONCILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_verification_status AS ENUM ('NOT_REQUIRED', 'PENDING', 'SENT', 'CONFIRMED', 'FAILED', 'MANUAL_VERIFIED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_document_status AS ENUM ('REQUIRED', 'PENDING_UPLOAD', 'UPLOADED', 'VERIFIED', 'WAIVED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_oda_lifecycle AS ENUM (
    'PRE_ORDER', 'COLLECTED', 'SUMMARY_PENDING', 'SUMMARY_APPROVED', 'PLACED',
    'OBSERVATION', 'EXECUTED', 'BOOKED', 'EXPIRED', 'REJECTED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_mld_lifecycle AS ENUM (
    'DRAFT', 'OFFERING', 'OFFERING_CLOSED', 'TRADED', 'CALLBACK_PENDING',
    'CALLBACK_COMPLETED', 'FIXING_PENDING', 'FIXED', 'MATURED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_facility_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'MARGIN_CALL', 'SUSPENDED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_collateral_status AS ENUM ('PLEDGED', 'ELIGIBLE', 'INELIGIBLE', 'RELEASE_PENDING', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS oems_products (
  id serial PRIMARY KEY,
  product_code text NOT NULL UNIQUE,
  product_name text NOT NULL,
  product_family oems_product_family NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  risk_score integer,
  product_score integer,
  min_subscription_amount numeric(21,4),
  max_subscription_amount numeric(21,4),
  tenor_days integer,
  source_system text,
  parameter_json jsonb,
  is_active boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS idx_oems_products_family ON oems_products(product_family);
CREATE INDEX IF NOT EXISTS idx_oems_products_active ON oems_products(is_active);

CREATE TABLE IF NOT EXISTS oems_parameter_sets (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES oems_products(id),
  version_no integer NOT NULL DEFAULT 1,
  parameter_status oems_parameter_status NOT NULL DEFAULT 'DRAFT',
  effective_from date NOT NULL,
  effective_to date,
  parameters jsonb NOT NULL,
  submitted_by text,
  submitted_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  rejected_reason text,
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

CREATE INDEX IF NOT EXISTS idx_oems_parameter_sets_product ON oems_parameter_sets(product_id);
CREATE INDEX IF NOT EXISTS idx_oems_parameter_sets_status ON oems_parameter_sets(parameter_status);

CREATE TABLE IF NOT EXISTS oems_orders (
  order_id text PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  product_family oems_product_family NOT NULL,
  product_id integer REFERENCES oems_products(id),
  parameter_set_id integer REFERENCES oems_parameter_sets(id),
  source_order_id text REFERENCES orders(order_id),
  customer_id text REFERENCES clients(client_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  channel oems_channel NOT NULL DEFAULT 'BRANCH',
  transaction_type text NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  amount numeric(21,4),
  quantity numeric(21,4),
  tenor_days integer,
  rate numeric(18,8),
  trade_date date,
  value_date date,
  maturity_date date,
  order_status oems_order_status NOT NULL DEFAULT 'DRAFT',
  risk_profile risk_profile,
  customer_risk_score integer,
  product_score integer,
  suitability_result oems_validation_result DEFAULT 'PASS',
  document_status oems_document_status DEFAULT 'REQUIRED',
  verification_status oems_verification_status DEFAULT 'NOT_REQUIRED',
  approval_tier text,
  assigned_role text,
  customer_confirmation_deadline timestamptz,
  special_rate_expires_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  created_by_role text,
  payload jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_orders_family_status ON oems_orders(product_family, order_status);
CREATE INDEX IF NOT EXISTS idx_oems_orders_customer ON oems_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_oems_orders_portfolio ON oems_orders(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_oems_orders_trade_date ON oems_orders(trade_date);

CREATE TABLE IF NOT EXISTS oems_order_validation_results (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  rule_code text NOT NULL,
  severity oems_validation_severity NOT NULL,
  result oems_validation_result NOT NULL,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'OEMS',
  blocking boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_oems_validation_order ON oems_order_validation_results(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_validation_result ON oems_order_validation_results(result, severity);

CREATE TABLE IF NOT EXISTS oems_digital_verifications (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  verification_status oems_verification_status NOT NULL DEFAULT 'PENDING',
  provider text,
  external_ref text,
  sent_at timestamptz,
  expires_at timestamptz,
  confirmed_at timestamptz,
  fallback_reason text,
  verified_by text,
  evidence jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_verification_order ON oems_digital_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_verification_status ON oems_digital_verifications(verification_status);

CREATE TABLE IF NOT EXISTS oems_document_registrations (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  document_type text NOT NULL,
  document_status oems_document_status NOT NULL DEFAULT 'PENDING_UPLOAD',
  required boolean NOT NULL DEFAULT true,
  external_document_id text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  verified_by text,
  rejection_reason text,
  metadata jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_documents_order ON oems_document_registrations(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_documents_status ON oems_document_registrations(document_status);

CREATE TABLE IF NOT EXISTS oems_oda_blotter_groups (
  id serial PRIMARY KEY,
  group_no text NOT NULL UNIQUE,
  currency text NOT NULL,
  tenor_days integer NOT NULL,
  value_date date NOT NULL,
  total_nominal numeric(21,4) NOT NULL DEFAULT 0,
  average_rate numeric(18,8),
  lifecycle oems_oda_lifecycle NOT NULL DEFAULT 'SUMMARY_PENDING',
  placement_summary jsonb,
  approved_by text,
  approved_at timestamptz,
  placed_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_oems_oda_blotter_lifecycle ON oems_oda_blotter_groups(lifecycle);
CREATE INDEX IF NOT EXISTS idx_oems_oda_blotter_value_date ON oems_oda_blotter_groups(value_date);

CREATE TABLE IF NOT EXISTS oems_oda_recommendations (
  id serial PRIMARY KEY,
  order_id text REFERENCES oems_orders(order_id),
  placement_group_id integer REFERENCES oems_oda_blotter_groups(id),
  recommendation_no text NOT NULL UNIQUE,
  customer_id text REFERENCES clients(client_id),
  currency text NOT NULL,
  tenor_days integer NOT NULL,
  nominal_amount numeric(21,4) NOT NULL,
  rate numeric(18,8) NOT NULL,
  tax_rate numeric(9,6) DEFAULT 0,
  expected_interest numeric(21,4),
  effective_type text NOT NULL DEFAULT 'TODAY',
  effective_date date NOT NULL,
  cutoff_at timestamptz NOT NULL,
  lifecycle oems_oda_lifecycle NOT NULL DEFAULT 'PRE_ORDER',
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

CREATE INDEX IF NOT EXISTS idx_oems_oda_recommendations_customer ON oems_oda_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_oems_oda_recommendations_lifecycle ON oems_oda_recommendations(lifecycle);
CREATE INDEX IF NOT EXISTS idx_oems_oda_recommendations_group ON oems_oda_recommendations(placement_group_id);

CREATE TABLE IF NOT EXISTS oems_mld_tranches (
  id serial PRIMARY KEY,
  tranche_code text NOT NULL UNIQUE,
  product_id integer REFERENCES oems_products(id),
  tranche_name text NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  offering_start date NOT NULL,
  offering_end date NOT NULL,
  trade_date date NOT NULL,
  value_date date NOT NULL,
  fixing_date date NOT NULL,
  maturity_date date NOT NULL,
  quota_amount numeric(21,4) NOT NULL,
  booked_amount numeric(21,4) NOT NULL DEFAULT 0,
  min_investment numeric(21,4),
  max_investment numeric(21,4),
  product_score integer,
  lifecycle oems_mld_lifecycle NOT NULL DEFAULT 'DRAFT',
  callback_required boolean NOT NULL DEFAULT true,
  callback_completed_at timestamptz,
  payoff_formula jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_mld_tranches_lifecycle ON oems_mld_tranches(lifecycle);
CREATE INDEX IF NOT EXISTS idx_oems_mld_tranches_offering ON oems_mld_tranches(offering_start, offering_end);

CREATE TABLE IF NOT EXISTS oems_portfolio_holdings (
  id serial PRIMARY KEY,
  customer_id text REFERENCES clients(client_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  product_family oems_product_family NOT NULL,
  product_code text NOT NULL,
  external_account_no text,
  holding_amount numeric(21,4) NOT NULL DEFAULT 0,
  market_value numeric(21,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  valuation_date date NOT NULL,
  pledged_facility_id text,
  source_system text,
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

CREATE INDEX IF NOT EXISTS idx_oems_holdings_customer ON oems_portfolio_holdings(customer_id);
CREATE INDEX IF NOT EXISTS idx_oems_holdings_portfolio ON oems_portfolio_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_oems_holdings_family ON oems_portfolio_holdings(product_family);

CREATE TABLE IF NOT EXISTS oems_integration_messages (
  id serial PRIMARY KEY,
  target_system text NOT NULL,
  message_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  integration_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  payload jsonb,
  response_payload jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  last_error text,
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

CREATE INDEX IF NOT EXISTS idx_oems_integration_entity ON oems_integration_messages(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_oems_integration_status ON oems_integration_messages(integration_status);

CREATE TABLE IF NOT EXISTS oems_notification_templates (
  id serial PRIMARY KEY,
  event_code text NOT NULL UNIQUE,
  product_family oems_product_family,
  channel notification_channel NOT NULL DEFAULT 'IN_APP',
  recipient_role text NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  sla_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS idx_oems_notification_templates_event ON oems_notification_templates(event_code);
CREATE INDEX IF NOT EXISTS idx_oems_notification_templates_family ON oems_notification_templates(product_family);

CREATE TABLE IF NOT EXISTS oems_notification_deliveries (
  id serial PRIMARY KEY,
  template_id integer REFERENCES oems_notification_templates(id),
  event_code text NOT NULL,
  order_id text REFERENCES oems_orders(order_id),
  recipient_id text,
  channel notification_channel NOT NULL DEFAULT 'IN_APP',
  delivery_status text NOT NULL DEFAULT 'PENDING',
  due_at timestamptz,
  sent_at timestamptz,
  payload jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_notification_deliveries_order ON oems_notification_deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_notification_deliveries_status ON oems_notification_deliveries(delivery_status);

CREATE TABLE IF NOT EXISTS oems_report_definitions (
  id serial PRIMARY KEY,
  report_code text NOT NULL UNIQUE,
  report_name text NOT NULL,
  product_family oems_product_family,
  filters_schema jsonb,
  columns jsonb NOT NULL,
  schedule text,
  is_active boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS idx_oems_report_definitions_family ON oems_report_definitions(product_family);
CREATE INDEX IF NOT EXISTS idx_oems_report_definitions_active ON oems_report_definitions(is_active);

CREATE TABLE IF NOT EXISTS oems_export_jobs (
  id serial PRIMARY KEY,
  report_id integer NOT NULL REFERENCES oems_report_definitions(id),
  requested_by text NOT NULL,
  export_status text NOT NULL DEFAULT 'QUEUED',
  filters jsonb,
  file_url text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
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

CREATE INDEX IF NOT EXISTS idx_oems_export_jobs_report ON oems_export_jobs(report_id);
CREATE INDEX IF NOT EXISTS idx_oems_export_jobs_status ON oems_export_jobs(export_status);

CREATE TABLE IF NOT EXISTS oems_wealth_lending_facilities (
  facility_id text PRIMARY KEY,
  facility_no text NOT NULL UNIQUE,
  customer_id text REFERENCES clients(client_id),
  portfolio_id text REFERENCES portfolios(portfolio_id),
  currency text NOT NULL DEFAULT 'IDR',
  limit_amount numeric(21,4) NOT NULL,
  outstanding_amount numeric(21,4) NOT NULL DEFAULT 0,
  ltv_limit numeric(9,6) NOT NULL,
  ltv_warning numeric(9,6) NOT NULL,
  facility_status oems_facility_status NOT NULL DEFAULT 'DRAFT',
  next_review_date date,
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

CREATE INDEX IF NOT EXISTS idx_oems_lending_customer ON oems_wealth_lending_facilities(customer_id);
CREATE INDEX IF NOT EXISTS idx_oems_lending_status ON oems_wealth_lending_facilities(facility_status);

CREATE TABLE IF NOT EXISTS oems_wealth_lending_collaterals (
  id serial PRIMARY KEY,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  holding_id integer REFERENCES oems_portfolio_holdings(id),
  product_family oems_product_family NOT NULL,
  product_code text NOT NULL,
  nominal_amount numeric(21,4),
  market_value numeric(21,4) NOT NULL,
  haircut_percent numeric(9,6) NOT NULL DEFAULT 0,
  eligible_value numeric(21,4) NOT NULL,
  collateral_status oems_collateral_status NOT NULL DEFAULT 'PLEDGED',
  valuation_date date NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_oems_collateral_facility ON oems_wealth_lending_collaterals(facility_id);
CREATE INDEX IF NOT EXISTS idx_oems_collateral_status ON oems_wealth_lending_collaterals(collateral_status);

CREATE TABLE IF NOT EXISTS oems_m2m_runs (
  id serial PRIMARY KEY,
  facility_id text NOT NULL REFERENCES oems_wealth_lending_facilities(facility_id),
  run_date date NOT NULL,
  collateral_value numeric(21,4) NOT NULL,
  outstanding_amount numeric(21,4) NOT NULL,
  current_ltv numeric(9,6) NOT NULL,
  breach_level text NOT NULL DEFAULT 'NONE',
  notification_payload jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_m2m_facility ON oems_m2m_runs(facility_id);
CREATE INDEX IF NOT EXISTS idx_oems_m2m_run_date ON oems_m2m_runs(run_date);
