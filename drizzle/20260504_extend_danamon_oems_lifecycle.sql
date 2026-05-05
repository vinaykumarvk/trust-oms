DO $$ BEGIN
  ALTER TYPE oems_channel ADD VALUE IF NOT EXISTS 'OEMS_DIRECT';
  ALTER TYPE oems_channel ADD VALUE IF NOT EXISTS 'CRM_MICROSITE';
  ALTER TYPE oems_channel ADD VALUE IF NOT EXISTS 'DBANK_PRO_MICROSITE';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE oems_order_status ADD VALUE IF NOT EXISTS 'VALIDATION_PENDING_EXTERNAL';
  ALTER TYPE oems_order_status ADD VALUE IF NOT EXISTS 'PENDING_CUSTOMER_VERIFICATION';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE oems_verification_status ADD VALUE IF NOT EXISTS 'CANCELLED';
  ALTER TYPE oems_verification_status ADD VALUE IF NOT EXISTS 'LOCKED';
  ALTER TYPE oems_verification_status ADD VALUE IF NOT EXISTS 'INVALIDATED';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'MISSING';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'GENERATED';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'SIGNED';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'REGISTERED_NCBS';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'REGISTERED_DMS';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'NCBS_RETRY_PENDING';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'DMS_RETRY_PENDING';
  ALTER TYPE oems_document_status ADD VALUE IF NOT EXISTS 'QUARANTINED';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_channel_session_status AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'INVALID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS oems_parameter_sets
  ADD COLUMN IF NOT EXISTS parameter_type text NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS channel oems_channel NOT NULL DEFAULT 'OEMS_DIRECT',
  ADD COLUMN IF NOT EXISTS product_timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS calendar_key text,
  ADD COLUMN IF NOT EXISTS cutoff_time text,
  ADD COLUMN IF NOT EXISTS cutoff_action text,
  ADD COLUMN IF NOT EXISTS allow_checker_repair_after_cutoff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_comments text;

CREATE INDEX IF NOT EXISTS idx_oems_parameter_sets_scope
  ON oems_parameter_sets(product_id, parameter_type, channel);

ALTER TABLE IF EXISTS oems_orders
  ADD COLUMN IF NOT EXISTS assisted_by_user_id text,
  ADD COLUMN IF NOT EXISTS branch_code text,
  ADD COLUMN IF NOT EXISTS channel_session_id text,
  ADD COLUMN IF NOT EXISTS channel_customer_ref text,
  ADD COLUMN IF NOT EXISTS processing_date date,
  ADD COLUMN IF NOT EXISTS external_refs jsonb,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb,
  ADD COLUMN IF NOT EXISTS cot_evaluation jsonb;

ALTER TABLE IF EXISTS oems_orders
  ALTER COLUMN channel SET DEFAULT 'OEMS_DIRECT';

CREATE TABLE IF NOT EXISTS oems_channel_sessions (
  session_id text PRIMARY KEY,
  channel oems_channel NOT NULL,
  origin_system text NOT NULL,
  customer_id text REFERENCES clients(client_id),
  assisted_by_user_id text,
  branch_code text,
  relationship_context jsonb,
  locale text NOT NULL DEFAULT 'en-ID',
  device_id text,
  channel_correlation_id text NOT NULL,
  channel_customer_ref text,
  redirect_url text,
  signature_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_validated_at timestamptz,
  session_status oems_channel_session_status NOT NULL DEFAULT 'ACTIVE',
  immutable_context jsonb NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_oems_channel_sessions_channel
  ON oems_channel_sessions(channel, session_status);

CREATE INDEX IF NOT EXISTS idx_oems_channel_sessions_customer
  ON oems_channel_sessions(customer_id);

CREATE INDEX IF NOT EXISTS idx_oems_channel_sessions_expires
  ON oems_channel_sessions(expires_at);

CREATE TABLE IF NOT EXISTS oems_order_status_transitions (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  from_status oems_order_status,
  to_status oems_order_status NOT NULL,
  event_code text NOT NULL,
  reason text,
  metadata jsonb,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
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

CREATE INDEX IF NOT EXISTS idx_oems_status_transitions_order
  ON oems_order_status_transitions(order_id, changed_at);

CREATE INDEX IF NOT EXISTS idx_oems_status_transitions_event
  ON oems_order_status_transitions(event_code);

ALTER TABLE IF EXISTS oems_digital_verifications
  ADD COLUMN IF NOT EXISTS verification_id text,
  ADD COLUMN IF NOT EXISTS customer_id text REFERENCES clients(client_id),
  ADD COLUMN IF NOT EXISTS document_id integer REFERENCES oems_document_registrations(id),
  ADD COLUMN IF NOT EXISTS verification_type text NOT NULL DEFAULT 'TRANSACTION_AUTHORIZATION',
  ADD COLUMN IF NOT EXISTS channel oems_channel NOT NULL DEFAULT 'OEMS_DIRECT',
  ADD COLUMN IF NOT EXISTS request_method text NOT NULL DEFAULT 'AUTH_LINK',
  ADD COLUMN IF NOT EXISTS authentication_link text,
  ADD COLUMN IF NOT EXISTS otp_delivery_channel text,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bound_document_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidation_reason text,
  ADD COLUMN IF NOT EXISTS fallback_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_channel text,
  ADD COLUMN IF NOT EXISTS fallback_approved_by text,
  ADD COLUMN IF NOT EXISTS fallback_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signed_document_url text,
  ADD COLUMN IF NOT EXISTS download_url text,
  ADD COLUMN IF NOT EXISTS third_party_status text,
  ADD COLUMN IF NOT EXISTS operations_alerted boolean NOT NULL DEFAULT false;

UPDATE oems_digital_verifications
SET verification_id = COALESCE(verification_id, 'DVS-' || id::text || '-' || extract(epoch FROM created_at)::bigint::text),
    payload_hash = COALESCE(payload_hash, md5(order_id || ':' || COALESCE(external_ref, '')))
WHERE verification_id IS NULL OR payload_hash IS NULL;

ALTER TABLE IF EXISTS oems_digital_verifications
  ALTER COLUMN verification_id SET NOT NULL,
  ALTER COLUMN payload_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_verification_id
  ON oems_digital_verifications(verification_id);

CREATE INDEX IF NOT EXISTS idx_oems_verification_customer
  ON oems_digital_verifications(customer_id);

CREATE INDEX IF NOT EXISTS idx_oems_verification_expiry
  ON oems_digital_verifications(expires_at);

CREATE TABLE IF NOT EXISTS oems_digital_verification_attempts (
  id serial PRIMARY KEY,
  verification_id integer NOT NULL REFERENCES oems_digital_verifications(id),
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  attempt_no integer NOT NULL,
  attempt_status oems_verification_status NOT NULL,
  auth_method text NOT NULL DEFAULT 'AUTH_LINK',
  channel oems_channel NOT NULL DEFAULT 'OEMS_DIRECT',
  provider text,
  provider_ref text,
  payload_hash text,
  failure_reason text,
  attempted_by text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  is_deleted boolean NOT NULL DEFAULT false,
  tenant_id text NOT NULL DEFAULT 'default',
  correlation_id text,
  audit_hash text,
  CONSTRAINT ux_oems_verification_attempt_no UNIQUE (verification_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_oems_verification_attempt_order
  ON oems_digital_verification_attempts(order_id);

CREATE INDEX IF NOT EXISTS idx_oems_verification_attempt_status
  ON oems_digital_verification_attempts(attempt_status);

CREATE TABLE IF NOT EXISTS oems_document_checklist_rules (
  id serial PRIMARY KEY,
  rule_code text NOT NULL UNIQUE,
  product_family oems_product_family,
  transaction_type text,
  channel oems_channel,
  document_type text NOT NULL,
  requirement_type text NOT NULL DEFAULT 'REQUIRED',
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocking_stage text NOT NULL DEFAULT 'SUBMISSION',
  template_code text,
  template_version integer NOT NULL DEFAULT 1,
  renewal_days integer,
  dms_required boolean NOT NULL DEFAULT true,
  ncbs_required boolean NOT NULL DEFAULT false,
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

CREATE INDEX IF NOT EXISTS idx_oems_doc_rules_scope
  ON oems_document_checklist_rules(product_family, transaction_type, channel);

CREATE INDEX IF NOT EXISTS idx_oems_doc_rules_type
  ON oems_document_checklist_rules(document_type);

CREATE INDEX IF NOT EXISTS idx_oems_doc_rules_active
  ON oems_document_checklist_rules(is_active);

ALTER TABLE IF EXISTS oems_document_registrations
  ADD COLUMN IF NOT EXISTS document_id text,
  ADD COLUMN IF NOT EXISTS customer_id text REFERENCES clients(client_id),
  ADD COLUMN IF NOT EXISTS portfolio_id text REFERENCES portfolios(portfolio_id),
  ADD COLUMN IF NOT EXISTS product_family oems_product_family,
  ADD COLUMN IF NOT EXISTS checklist_rule_id integer REFERENCES oems_document_checklist_rules(id),
  ADD COLUMN IF NOT EXISTS requirement_type text NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN IF NOT EXISTS blocking_stage text NOT NULL DEFAULT 'SUBMISSION',
  ADD COLUMN IF NOT EXISTS template_code text,
  ADD COLUMN IF NOT EXISTS template_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS expected_file_hash text,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS hash_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dms_document_id text,
  ADD COLUMN IF NOT EXISTS dms_status text,
  ADD COLUMN IF NOT EXISTS dms_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS dms_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ncbs_document_id text,
  ADD COLUMN IF NOT EXISTS ncbs_status text,
  ADD COLUMN IF NOT EXISTS ncbs_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS ncbs_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE oems_document_registrations
SET document_id = COALESCE(document_id, 'DOC-' || id::text || '-' || extract(epoch FROM created_at)::bigint::text),
    customer_id = COALESCE(customer_id, (SELECT customer_id FROM oems_orders WHERE oems_orders.order_id = oems_document_registrations.order_id)),
    portfolio_id = COALESCE(portfolio_id, (SELECT portfolio_id FROM oems_orders WHERE oems_orders.order_id = oems_document_registrations.order_id)),
    product_family = COALESCE(product_family, (SELECT product_family FROM oems_orders WHERE oems_orders.order_id = oems_document_registrations.order_id)),
    metadata = COALESCE(metadata, '{}'::jsonb)
WHERE document_id IS NULL OR customer_id IS NULL OR portfolio_id IS NULL OR product_family IS NULL OR metadata IS NULL;

ALTER TABLE IF EXISTS oems_document_registrations
  ALTER COLUMN document_id SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_document_id
  ON oems_document_registrations(document_id);

CREATE INDEX IF NOT EXISTS idx_oems_documents_customer
  ON oems_document_registrations(customer_id);

CREATE INDEX IF NOT EXISTS idx_oems_documents_type
  ON oems_document_registrations(document_type);

CREATE INDEX IF NOT EXISTS idx_oems_documents_retry
  ON oems_document_registrations(next_retry_at);

CREATE TABLE IF NOT EXISTS oems_risk_questionnaire_versions (
  id serial PRIMARY KEY,
  questionnaire_code text NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  questionnaire_name text NOT NULL,
  customer_category text NOT NULL DEFAULT 'BOTH',
  questionnaire_type text NOT NULL DEFAULT 'STANDARD',
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  mandatory_question_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_bands jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_period_months integer NOT NULL DEFAULT 12,
  questionnaire_status oems_parameter_status NOT NULL DEFAULT 'DRAFT',
  effective_from date NOT NULL,
  effective_to date,
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
  audit_hash text,
  CONSTRAINT ux_oems_risk_questionnaire_version UNIQUE (questionnaire_code, version_no)
);

CREATE INDEX IF NOT EXISTS idx_oems_risk_questionnaire_status
  ON oems_risk_questionnaire_versions(questionnaire_status);

CREATE INDEX IF NOT EXISTS idx_oems_risk_questionnaire_effective
  ON oems_risk_questionnaire_versions(effective_from, effective_to);

CREATE TABLE IF NOT EXISTS oems_risk_profile_assessments (
  id serial PRIMARY KEY,
  assessment_id text NOT NULL UNIQUE,
  customer_id text NOT NULL REFERENCES clients(client_id),
  questionnaire_id integer NOT NULL REFERENCES oems_risk_questionnaire_versions(id),
  assessment_status text NOT NULL DEFAULT 'ACTIVE',
  answers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  answered_question_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_score numeric(18,4) NOT NULL DEFAULT 0,
  risk_profile risk_profile NOT NULL,
  risk_score integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  partial_answers boolean NOT NULL DEFAULT false,
  conflict_status text NOT NULL DEFAULT 'NONE',
  external_source text,
  external_risk_profile risk_profile,
  external_risk_score integer,
  strict_risk_profile risk_profile,
  strict_risk_score integer,
  rbs_sync_status text,
  avantrade_sync_status text,
  last_synced_at timestamptz,
  reassessment_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_risk_assessment_id
  ON oems_risk_profile_assessments(assessment_id);

CREATE INDEX IF NOT EXISTS idx_oems_risk_assessment_customer
  ON oems_risk_profile_assessments(customer_id, is_active);

CREATE INDEX IF NOT EXISTS idx_oems_risk_assessment_expiry
  ON oems_risk_profile_assessments(effective_to);

CREATE INDEX IF NOT EXISTS idx_oems_risk_assessment_conflict
  ON oems_risk_profile_assessments(conflict_status);

CREATE TABLE IF NOT EXISTS oems_product_risk_mappings (
  id serial PRIMARY KEY,
  mapping_code text NOT NULL UNIQUE,
  product_id integer REFERENCES oems_products(id),
  product_code text,
  product_family oems_product_family NOT NULL,
  transaction_type text,
  product_risk_profile risk_profile NOT NULL,
  product_risk_score integer NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  mapping_status oems_parameter_status NOT NULL DEFAULT 'DRAFT',
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_product_risk_mapping_code
  ON oems_product_risk_mappings(mapping_code);

CREATE INDEX IF NOT EXISTS idx_oems_product_risk_scope
  ON oems_product_risk_mappings(product_family, transaction_type);

CREATE INDEX IF NOT EXISTS idx_oems_product_risk_status
  ON oems_product_risk_mappings(mapping_status);

DO $$ BEGIN
  ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'DBANK_PRO';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oems_notification_template_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS oems_notification_templates
  ADD COLUMN IF NOT EXISTS template_code text,
  ADD COLUMN IF NOT EXISTS delivery_channels jsonb NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  ADD COLUMN IF NOT EXISTS language_default text NOT NULL DEFAULT 'en-ID',
  ADD COLUMN IF NOT EXISTS localized_subjects jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS localized_bodies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_status oems_notification_template_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_attachment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_password_policy jsonb,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS oems_notification_templates
  DROP CONSTRAINT IF EXISTS oems_notification_templates_event_code_unique;

UPDATE oems_notification_templates
SET template_code = COALESCE(template_code, event_code)
WHERE template_code IS NULL;

ALTER TABLE IF EXISTS oems_notification_templates
  ALTER COLUMN template_code SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oems_notification_templates_template_code
  ON oems_notification_templates(template_code);

CREATE INDEX IF NOT EXISTS idx_oems_notification_templates_status
  ON oems_notification_templates(template_status, is_active);

CREATE INDEX IF NOT EXISTS idx_oems_notification_templates_event_role
  ON oems_notification_templates(event_code, recipient_role);

ALTER TABLE IF EXISTS oems_notification_deliveries
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS language_code text NOT NULL DEFAULT 'en-ID',
  ADD COLUMN IF NOT EXISTS delivery_group_id text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS exception_reason text,
  ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_transaction_blocking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_policy jsonb,
  ADD COLUMN IF NOT EXISTS operations_visible boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_oems_notification_deliveries_event
  ON oems_notification_deliveries(event_code);

CREATE INDEX IF NOT EXISTS idx_oems_notification_deliveries_group
  ON oems_notification_deliveries(delivery_group_id);

CREATE TABLE IF NOT EXISTS oems_notification_delivery_attempts (
  id serial PRIMARY KEY,
  delivery_id integer NOT NULL REFERENCES oems_notification_deliveries(id),
  attempt_no integer NOT NULL,
  channel notification_channel NOT NULL,
  provider text NOT NULL DEFAULT 'INTERNAL',
  attempt_status text NOT NULL DEFAULT 'QUEUED',
  attempted_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  failure_reason text,
  response_payload jsonb,
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

CREATE INDEX IF NOT EXISTS idx_oems_notification_attempts_delivery
  ON oems_notification_delivery_attempts(delivery_id);

CREATE INDEX IF NOT EXISTS idx_oems_notification_attempts_status
  ON oems_notification_delivery_attempts(attempt_status);

ALTER TABLE IF EXISTS oems_report_definitions
  ADD COLUMN IF NOT EXISTS report_category text NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS allowed_formats jsonb NOT NULL DEFAULT '["CSV"]'::jsonb,
  ALTER COLUMN filters_schema SET DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_sources jsonb NOT NULL DEFAULT '["OEMS"]'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_row_threshold integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS protection_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS history_source_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE oems_report_definitions
SET filters_schema = COALESCE(filters_schema, '{}'::jsonb)
WHERE filters_schema IS NULL;

ALTER TABLE IF EXISTS oems_report_definitions
  ALTER COLUMN filters_schema SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oems_report_definitions_category
  ON oems_report_definitions(report_category);

ALTER TABLE IF EXISTS oems_export_jobs
  ADD COLUMN IF NOT EXISTS export_job_id text,
  ADD COLUMN IF NOT EXISTS requested_format text NOT NULL DEFAULT 'CSV',
  ADD COLUMN IF NOT EXISTS source_systems jsonb NOT NULL DEFAULT '["OEMS"]'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'SYNC',
  ADD COLUMN IF NOT EXISTS row_count integer,
  ADD COLUMN IF NOT EXISTS async_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protected_file boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protection_policy jsonb,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text;

UPDATE oems_export_jobs
SET export_job_id = COALESCE(export_job_id, 'EXP-' || id::text)
WHERE export_job_id IS NULL;

ALTER TABLE IF EXISTS oems_export_jobs
  ALTER COLUMN export_job_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_oems_export_jobs_export_job_id
  ON oems_export_jobs(export_job_id);

CREATE INDEX IF NOT EXISTS idx_oems_export_jobs_external_id
  ON oems_export_jobs(export_job_id);

CREATE INDEX IF NOT EXISTS idx_oems_export_jobs_requested
  ON oems_export_jobs(requested_by, created_at);

CREATE TABLE IF NOT EXISTS oems_transaction_history_requests (
  request_id text PRIMARY KEY,
  customer_id text REFERENCES clients(client_id),
  cif text,
  product_family oems_product_family,
  from_date date NOT NULL,
  to_date date NOT NULL,
  history_age_bucket text NOT NULL,
  source_systems jsonb NOT NULL,
  source_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  history_status text NOT NULL DEFAULT 'QUEUED',
  result_summary jsonb,
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
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

CREATE INDEX IF NOT EXISTS idx_oems_history_customer
  ON oems_transaction_history_requests(customer_id);

CREATE INDEX IF NOT EXISTS idx_oems_history_cif
  ON oems_transaction_history_requests(cif);

CREATE INDEX IF NOT EXISTS idx_oems_history_status
  ON oems_transaction_history_requests(history_status);

CREATE INDEX IF NOT EXISTS idx_oems_history_date_range
  ON oems_transaction_history_requests(from_date, to_date);

ALTER TABLE IF EXISTS oems_portfolio_holdings
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS original_market_value numeric(21,4),
  ADD COLUMN IF NOT EXISTS local_currency text NOT NULL DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS local_market_value numeric(21,4),
  ADD COLUMN IF NOT EXISTS fx_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS fx_rate_source text,
  ADD COLUMN IF NOT EXISTS fx_rate_as_of date,
  ADD COLUMN IF NOT EXISTS realized_gain_loss numeric(21,4),
  ADD COLUMN IF NOT EXISTS unrealized_gain_loss numeric(21,4),
  ADD COLUMN IF NOT EXISTS profit_gain numeric(21,4),
  ADD COLUMN IF NOT EXISTS left_principal numeric(21,4),
  ADD COLUMN IF NOT EXISTS left_term_days integer,
  ADD COLUMN IF NOT EXISTS maturity_date date,
  ADD COLUMN IF NOT EXISTS source_status text NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS source_last_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_payload jsonb,
  ADD COLUMN IF NOT EXISTS transaction_redirect_url text;

CREATE INDEX IF NOT EXISTS idx_oems_holdings_source
  ON oems_portfolio_holdings(source_system, source_status);

INSERT INTO oems_report_definitions (
  report_code,
  report_name,
  report_category,
  product_family,
  allowed_formats,
  filters_schema,
  columns,
  data_sources,
  sync_row_threshold,
  protection_policy,
  history_source_policy,
  created_by
) VALUES (
  'PORTFOLIO_PERFORMANCE',
  'Portfolio Performance',
  'PORTFOLIO',
  NULL,
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"customerId":{"type":"text"},"portfolioId":{"type":"text"},"productFamily":{"type":"text"},"holdingMetric":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb,
  '["customer_id","portfolio_id","product_family","product_code","currency","market_value","local_market_value","realized_gain_loss","unrealized_gain_loss","source_system","source_status"]'::jsonb,
  '["OEMS","WEALTH_CORE","CORE_BANKING"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential"}'::jsonb,
  '{}'::jsonb,
  'migration'
) ON CONFLICT (report_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS oems_integration_adapters (
  id serial PRIMARY KEY,
  adapter_id text NOT NULL UNIQUE,
  target_system text NOT NULL,
  adapter_type text NOT NULL DEFAULT 'REST',
  endpoint_url text,
  auth_profile_ref text,
  contract_version text NOT NULL DEFAULT 'v1',
  contract_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  transformation_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms integer NOT NULL DEFAULT 30000,
  max_retries integer NOT NULL DEFAULT 3,
  retry_backoff_seconds integer NOT NULL DEFAULT 300,
  adapter_status text NOT NULL DEFAULT 'DRAFT',
  certification_status text NOT NULL DEFAULT 'UNCERTIFIED',
  mock_mode boolean NOT NULL DEFAULT true,
  reconciliation_required boolean NOT NULL DEFAULT true,
  last_health_status text,
  last_health_check_at timestamptz,
  runbook_url text,
  owner_team text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_integration_adapter_id
  ON oems_integration_adapters(adapter_id);

CREATE INDEX IF NOT EXISTS idx_oems_integration_adapters_target
  ON oems_integration_adapters(target_system, adapter_status);

CREATE INDEX IF NOT EXISTS idx_oems_integration_adapters_certification
  ON oems_integration_adapters(certification_status);

DO $$
BEGIN
  IF to_regclass('public.core_banking_instructions') IS NOT NULL
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

CREATE TABLE IF NOT EXISTS oems_integration_adapter_executions (
  id serial PRIMARY KEY,
  execution_id text NOT NULL UNIQUE,
  adapter_id text NOT NULL REFERENCES oems_integration_adapters(adapter_id),
  integration_message_id integer REFERENCES oems_integration_messages(id),
  target_system text NOT NULL,
  message_type text NOT NULL,
  idempotency_key text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  execution_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  request_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  error_code text,
  error_message text,
  next_retry_at timestamptz,
  reconciliation_status text NOT NULL DEFAULT 'PENDING',
  executed_at timestamptz,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_adapter_execution_id
  ON oems_integration_adapter_executions(execution_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_adapter_execution_idempotency
  ON oems_integration_adapter_executions(adapter_id, idempotency_key, attempt_no);

CREATE INDEX IF NOT EXISTS idx_oems_adapter_executions_adapter
  ON oems_integration_adapter_executions(adapter_id, execution_status);

CREATE INDEX IF NOT EXISTS idx_oems_adapter_executions_message
  ON oems_integration_adapter_executions(integration_message_id);

CREATE TABLE IF NOT EXISTS oems_report_render_artifacts (
  id serial PRIMARY KEY,
  artifact_id text NOT NULL UNIQUE,
  export_job_id text NOT NULL REFERENCES oems_export_jobs(export_job_id),
  report_code text NOT NULL,
  requested_format text NOT NULL,
  renderer text NOT NULL DEFAULT 'OEMS_RENDERER',
  render_status text NOT NULL DEFAULT 'READY',
  file_url text NOT NULL,
  file_hash text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  protected_file boolean NOT NULL DEFAULT false,
  protection_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  render_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_report_artifact_id
  ON oems_report_render_artifacts(artifact_id);

CREATE INDEX IF NOT EXISTS idx_oems_report_artifacts_job
  ON oems_report_render_artifacts(export_job_id);

CREATE INDEX IF NOT EXISTS idx_oems_report_artifacts_report
  ON oems_report_render_artifacts(report_code, render_status);

CREATE TABLE IF NOT EXISTS oems_approval_workflow_definitions (
  id serial PRIMARY KEY,
  workflow_code text NOT NULL UNIQUE,
  product_family oems_product_family,
  transaction_type text,
  channel oems_channel,
  entity_type text NOT NULL DEFAULT 'oems_order',
  trigger_status text NOT NULL DEFAULT 'PENDING_APPROVAL',
  maker_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  checker_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_approval_count integer NOT NULL DEFAULT 1,
  sla_minutes integer NOT NULL DEFAULT 240,
  escalation_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignment_strategy text NOT NULL DEFAULT 'ROLE_QUEUE',
  workflow_status text NOT NULL DEFAULT 'ACTIVE',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_approval_workflow_code
  ON oems_approval_workflow_definitions(workflow_code);

CREATE INDEX IF NOT EXISTS idx_oems_approval_workflow_scope
  ON oems_approval_workflow_definitions(product_family, transaction_type, channel);

CREATE INDEX IF NOT EXISTS idx_oems_approval_workflow_status
  ON oems_approval_workflow_definitions(workflow_status);

CREATE TABLE IF NOT EXISTS oems_approval_queue_items (
  id serial PRIMARY KEY,
  queue_item_id text NOT NULL UNIQUE,
  workflow_id integer NOT NULL REFERENCES oems_approval_workflow_definitions(id),
  order_id text REFERENCES oems_orders(order_id),
  entity_type text NOT NULL DEFAULT 'oems_order',
  entity_id text NOT NULL,
  approval_status text NOT NULL DEFAULT 'PENDING',
  assigned_role text NOT NULL,
  assigned_user_id text,
  maker_user_id text NOT NULL,
  claimed_by text,
  claimed_at timestamptz,
  decision_by text,
  decision_at timestamptz,
  decision_comment text,
  due_at timestamptz,
  escalation_status text NOT NULL DEFAULT 'NONE',
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_approval_queue_item_id
  ON oems_approval_queue_items(queue_item_id);

CREATE INDEX IF NOT EXISTS idx_oems_approval_queue_workflow
  ON oems_approval_queue_items(workflow_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_oems_approval_queue_role
  ON oems_approval_queue_items(assigned_role, approval_status, due_at);

CREATE INDEX IF NOT EXISTS idx_oems_approval_queue_order
  ON oems_approval_queue_items(order_id);

CREATE TABLE IF NOT EXISTS oems_migration_rollback_scripts (
  id serial PRIMARY KEY,
  rollback_id text NOT NULL UNIQUE,
  migration_name text NOT NULL,
  rollback_script_path text NOT NULL,
  rollback_sql text NOT NULL,
  checksum text NOT NULL,
  verification_status text NOT NULL DEFAULT 'PENDING_REVIEW',
  verified_by text,
  verified_at timestamptz,
  notes text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_rollback_id
  ON oems_migration_rollback_scripts(rollback_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_rollback_migration
  ON oems_migration_rollback_scripts(migration_name);

CREATE INDEX IF NOT EXISTS idx_oems_rollback_status
  ON oems_migration_rollback_scripts(verification_status);

INSERT INTO oems_integration_adapters (
  adapter_id,
  target_system,
  adapter_type,
  endpoint_url,
  auth_profile_ref,
  contract_version,
  contract_schema,
  transformation_map,
  adapter_status,
  certification_status,
  mock_mode,
  reconciliation_required,
  runbook_url,
  owner_team,
  created_by
) VALUES
('ADP-WEALTH-CORE', 'WEALTH_CORE', 'REST', '/integrations/wealth-core/v1', 'vault://oems/wealth-core', 'v1.0', '{"operations":["customerStaticData","productSetup","orderRegistration","pfe","salesCertification"]}'::jsonb, '{"orderId":"external_refs.wealthCoreOrderId"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/wealth-core', 'Wealth Platform', 'migration'),
('ADP-RBS', 'RBS', 'REST', '/integrations/rbs/v1', 'vault://oems/rbs', 'v1.0', '{"operations":["riskProfileRead","riskProfileSync"]}'::jsonb, '{"riskProfile":"risk_profile"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/rbs', 'Risk Platform', 'migration'),
('ADP-CA-CIB', 'CA_CIB', 'REST', '/integrations/ca-cib/v1', 'vault://oems/ca-cib', 'v1.0', '{"operations":["treasuryDeal","structuredProductBooking"]}'::jsonb, '{"treasuryDealId":"external_refs.caCibDealId"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/ca-cib', 'Treasury Technology', 'migration'),
('ADP-NCBS', 'NCBS', 'ISO20022', '/integrations/ncbs/v1', 'vault://oems/ncbs', 'v1.0', '{"operations":["accountHold","fundRelease","tdCreate","maturityCredit","documentRegistration"]}'::jsonb, '{"accountNo":"account_no","cif":"customer_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/ncbs', 'Core Banking', 'migration'),
('ADP-TREASURY', 'TREASURY', 'REST', '/integrations/treasury/v1', 'vault://oems/treasury', 'v1.0', '{"operations":["referenceRate","rfq","summaryDeal"]}'::jsonb, '{"rateId":"rate_id","dealId":"treasury_dealing_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/treasury', 'Treasury Operations', 'migration'),
('ADP-BIU', 'BIU', 'FILE', '/integrations/biu/v1', 'vault://oems/biu', 'v1.0', '{"operations":["exclusionList","surveyCampaign","salesPipeline"]}'::jsonb, '{"campaignId":"campaign_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/biu', 'BIU', 'migration'),
('ADP-DOCUSIGN-ESIGN', 'DOCUSIGN_ESIGN', 'REST', '/integrations/esign/v1', 'vault://oems/esign', 'v1.0', '{"operations":["authLink","otp","mpin","digitalSignature"]}'::jsonb, '{"verificationId":"verification_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/esign', 'Digital Channels', 'migration'),
('ADP-NOTIFICATION-GATEWAY', 'NOTIFICATION_GATEWAY', 'REST', '/integrations/notifications/v1', 'vault://oems/notifications', 'v1.0', '{"operations":["email","sms","push","inApp","pagerDuty"]}'::jsonb, '{"deliveryId":"delivery_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/notifications', 'Enterprise Notifications', 'migration'),
('ADP-BIG-DATA', 'BIG_DATA', 'REST', '/integrations/big-data/v1', 'vault://oems/big-data', 'v1.0', '{"operations":["transactionHistoryOver90Days","reportDataset"]}'::jsonb, '{"historyRequestId":"request_id"}'::jsonb, 'ACTIVE', 'CERTIFICATION_PENDING', true, true, '/runbooks/oems/big-data', 'Data Platform', 'migration')
ON CONFLICT (adapter_id) DO UPDATE SET
  adapter_status = EXCLUDED.adapter_status,
  certification_status = EXCLUDED.certification_status,
  contract_schema = EXCLUDED.contract_schema,
  transformation_map = EXCLUDED.transformation_map,
  updated_at = now(),
  updated_by = 'migration';

INSERT INTO oems_report_definitions (
  report_code,
  report_name,
  report_category,
  product_family,
  allowed_formats,
  filters_schema,
  columns,
  data_sources,
  sync_row_threshold,
  protection_policy,
  history_source_policy,
  schedule,
  created_by
) VALUES
('OEMS_RFP_REPORT_PACK', 'OEMS RFP Enterprise Report Pack', 'OPERATIONAL', NULL, '["XLSX","CSV","PDF","TXT"]'::jsonb, '{"dateFrom":{"type":"date"},"dateTo":{"type":"date"},"productFamily":{"type":"text"},"channel":{"type":"text"},"status":{"type":"text"}}'::jsonb, '["report_code","product_family","channel","status","count","amount","source_systems","generated_at"]'::jsonb, '["OEMS","WEALTH_CORE","NCBS","TREASURY","BIG_DATA"]'::jsonb, 50000, '{"watermark":"Danamon OEMS Confidential","passwordPolicy":"ROLE_OR_JOB_PASSWORD"}'::jsonb, '{"over90Days":["BIG_DATA"],"under90Days":["OEMS","CORE_BANKING"]}'::jsonb, 'ON_DEMAND', 'migration'),
('OEMS_ADAPTER_RECONCILIATION', 'OEMS Adapter Reconciliation and Retry Report', 'INTEGRATION', NULL, '["XLSX","CSV","PDF"]'::jsonb, '{"targetSystem":{"type":"text"},"status":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb, '["adapter_id","target_system","message_type","execution_status","retry_count","reconciliation_status","next_retry_at"]'::jsonb, '["OEMS","TARGET_SYSTEM"]'::jsonb, 50000, '{"watermark":"Danamon OEMS Confidential"}'::jsonb, '{}'::jsonb, 'HOURLY', 'migration'),
('OEMS_APPROVAL_QUEUE_SLA', 'OEMS Approval Queue SLA Report', 'APPROVAL', NULL, '["XLSX","CSV","PDF"]'::jsonb, '{"assignedRole":{"type":"text"},"approvalStatus":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb, '["queue_item_id","workflow_code","entity_id","assigned_role","maker_user_id","approval_status","due_at","decision_at"]'::jsonb, '["OEMS"]'::jsonb, 20000, '{"watermark":"Danamon OEMS Confidential"}'::jsonb, '{}'::jsonb, 'DAILY', 'migration')
ON CONFLICT (report_code) DO NOTHING;

INSERT INTO oems_approval_workflow_definitions (
  workflow_code,
  product_family,
  transaction_type,
  channel,
  entity_type,
  trigger_status,
  maker_roles,
  checker_roles,
  required_approval_count,
  sla_minutes,
  escalation_roles,
  assignment_strategy,
  workflow_status,
  payload,
  created_by
) VALUES
('OEMS-ODA-ORDER-APPROVAL', 'ODA', 'ODA_ORDER', 'OEMS_DIRECT', 'oems_order', 'PENDING_APPROVAL', '["RELATIONSHIP_MANAGER","TRADER","BO_MAKER"]'::jsonb, '["SENIOR_RM","SENIOR_TRADER","BO_CHECKER","BO_HEAD"]'::jsonb, 1, 120, '["BO_HEAD","TREASURY"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"blocksMakerSelfApproval":true,"cotAware":true}'::jsonb, 'migration'),
('OEMS-MLD-TRANCHE-APPROVAL', 'MLD', 'MLD_TRANCHE', 'BACK_OFFICE', 'oems_mld_tranche', 'PENDING_APPROVAL', '["BO_MAKER","TREASURY"]'::jsonb, '["BO_CHECKER","BO_HEAD","TREASURY_SND"]'::jsonb, 1, 240, '["BO_HEAD"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"blocksMakerSelfApproval":true,"callbackRequired":true}'::jsonb, 'migration'),
('OEMS-WEALTH-ORDER-APPROVAL', 'MUTUAL_FUND', 'SUBSCRIPTION', 'OEMS_DIRECT', 'oems_order', 'PENDING_APPROVAL', '["RELATIONSHIP_MANAGER","BO_MAKER"]'::jsonb, '["SENIOR_RM","BO_CHECKER"]'::jsonb, 1, 180, '["BO_HEAD"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"appliesTo":["MUTUAL_FUND","BOND"],"requiresWealthCoreValidation":true}'::jsonb, 'migration'),
('OEMS-FX-TODAY-APPROVAL', 'FX_TODAY', 'FX_TODAY_DEAL', 'TREASURY', 'oems_fx_today_detail', 'PENDING_APPROVAL', '["TRADER","TREASURY"]'::jsonb, '["SENIOR_TRADER","TREASURY_SND"]'::jsonb, 1, 60, '["TREASURY_SND"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"sameDaySettlementSla":true}'::jsonb, 'migration'),
('OEMS-PARAMETER-APPROVAL', NULL, 'PARAMETER_CHANGE', 'BACK_OFFICE', 'oems_parameter_set', 'PENDING_APPROVAL', '["SYSTEM_ADMIN","BO_MAKER"]'::jsonb, '["BO_CHECKER","BO_HEAD"]'::jsonb, 1, 480, '["BO_HEAD"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"blocksMakerSelfApproval":true,"versioned":true}'::jsonb, 'migration'),
('OEMS-REPORT-EXPORT-APPROVAL', NULL, 'SENSITIVE_REPORT_EXPORT', 'BACK_OFFICE', 'oems_export_job', 'PENDING_APPROVAL', '["BO_MAKER","SYSTEM_ADMIN"]'::jsonb, '["BO_CHECKER","BO_HEAD"]'::jsonb, 1, 240, '["BO_HEAD"]'::jsonb, 'ROLE_QUEUE', 'ACTIVE', '{"protectedExportsOnly":true}'::jsonb, 'migration')
ON CONFLICT (workflow_code) DO UPDATE SET
  checker_roles = EXCLUDED.checker_roles,
  escalation_roles = EXCLUDED.escalation_roles,
  workflow_status = EXCLUDED.workflow_status,
  payload = EXCLUDED.payload,
  updated_at = now(),
  updated_by = 'migration';

INSERT INTO oems_migration_rollback_scripts (
  rollback_id,
  migration_name,
  rollback_script_path,
  rollback_sql,
  checksum,
  verification_status,
  notes,
  created_by
) VALUES (
  'RB-20260504-OEMS-LIFECYCLE',
  '20260504_extend_danamon_oems_lifecycle.sql',
  'drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql',
  'See drizzle/20260504_extend_danamon_oems_lifecycle.rollback.sql for the controlled rollback script.',
  'REGISTERED-IN-APP-CHECKSUM',
  'PENDING_REVIEW',
  'Rollback must be reviewed by DBA and OEMS product owner before execution in any shared environment.',
  'migration'
) ON CONFLICT (migration_name) DO UPDATE SET
  rollback_script_path = EXCLUDED.rollback_script_path,
  rollback_sql = EXCLUDED.rollback_sql,
  verification_status = EXCLUDED.verification_status,
  notes = EXCLUDED.notes,
  updated_at = now(),
  updated_by = 'migration';

CREATE TABLE IF NOT EXISTS oems_wealth_customer_static_data (
  id serial PRIMARY KEY,
  static_data_id text NOT NULL UNIQUE,
  customer_id text REFERENCES clients(client_id),
  cif text,
  portfolio_id text REFERENCES portfolios(portfolio_id),
  source_system text NOT NULL,
  target_system text NOT NULL DEFAULT 'WEALTH_CORE',
  retrieval_status text NOT NULL DEFAULT 'AVAILABLE',
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_of_truth jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_status text NOT NULL DEFAULT 'NONE',
  conflict_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_comment text,
  resolved_by text,
  resolved_at timestamptz,
  last_retrieved_at timestamptz,
  failure_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_wealth_static_data_id
  ON oems_wealth_customer_static_data(static_data_id);
CREATE INDEX IF NOT EXISTS idx_oems_wealth_static_customer
  ON oems_wealth_customer_static_data(customer_id, source_system);
CREATE INDEX IF NOT EXISTS idx_oems_wealth_static_conflict
  ON oems_wealth_customer_static_data(conflict_status, retrieval_status);

CREATE TABLE IF NOT EXISTS oems_wealth_product_snapshots (
  id serial PRIMARY KEY,
  snapshot_id text NOT NULL UNIQUE,
  product_code text NOT NULL,
  product_family oems_product_family NOT NULL,
  source_system text NOT NULL DEFAULT 'WEALTH_CORE',
  product_status text NOT NULL DEFAULT 'ACTIVE',
  setup_status text NOT NULL DEFAULT 'READY',
  quota_amount numeric(21,4),
  quota_remaining numeric(21,4),
  offering_start date,
  offering_end date,
  performance_1m numeric(18,8),
  performance_1y numeric(18,8),
  performance_3y numeric(18,8),
  performance_5y numeric(18,8),
  performance_required boolean NOT NULL DEFAULT false,
  performance_status text NOT NULL DEFAULT 'AVAILABLE',
  sku_document_id text,
  pfe_document_id text,
  transaction_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_wealth_product_snapshot_id
  ON oems_wealth_product_snapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_oems_wealth_product_snapshot_product
  ON oems_wealth_product_snapshots(product_code, product_family);
CREATE INDEX IF NOT EXISTS idx_oems_wealth_product_snapshot_setup
  ON oems_wealth_product_snapshots(setup_status, performance_status);

CREATE TABLE IF NOT EXISTS oems_mf_bond_order_details (
  id serial PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES oems_orders(order_id),
  product_family oems_product_family NOT NULL,
  product_code text,
  transaction_variant text NOT NULL,
  sid_status text NOT NULL DEFAULT 'PENDING',
  account_portfolio_status text NOT NULL DEFAULT 'PENDING',
  pfe_status text NOT NULL DEFAULT 'PENDING',
  risk_profile_status text NOT NULL DEFAULT 'PENDING',
  static_data_status text NOT NULL DEFAULT 'PENDING',
  sales_certification_status text NOT NULL DEFAULT 'PENDING',
  digital_verification_status text NOT NULL DEFAULT 'PENDING',
  digital_verification_expires_at timestamptz,
  wealth_core_target text NOT NULL DEFAULT 'WEALTH_CORE',
  wealth_core_status text NOT NULL DEFAULT 'NOT_SENT',
  wealth_core_order_id text,
  wealth_core_rejection_reason text,
  product_setup_status text,
  quota_validation_status text,
  offering_validation_status text,
  performance_claim_status text,
  supervisor_approval_status text,
  treasury_approval_status text,
  cherry_pick_lots jsonb NOT NULL DEFAULT '[]'::jsonb,
  switch_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  auction_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  buyback_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_status jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mf_bond_order_detail_order
  ON oems_mf_bond_order_details(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_mf_bond_detail_product
  ON oems_mf_bond_order_details(product_family, product_code);
CREATE INDEX IF NOT EXISTS idx_oems_mf_bond_detail_wealth_core
  ON oems_mf_bond_order_details(wealth_core_status);

CREATE TABLE IF NOT EXISTS oems_bond_pricing_locks (
  id serial PRIMARY KEY,
  lock_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  bond_code text NOT NULL,
  requested_price numeric(21,8) NOT NULL,
  market_price numeric(21,8),
  lower_bound numeric(21,8),
  upper_bound numeric(21,8),
  locked_price numeric(21,8) NOT NULL,
  locked_until timestamptz NOT NULL,
  approval_route text NOT NULL,
  lock_status text NOT NULL DEFAULT 'LOCKED',
  approval_status text NOT NULL DEFAULT 'PENDING',
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_bond_pricing_lock_id
  ON oems_bond_pricing_locks(lock_id);
CREATE INDEX IF NOT EXISTS idx_oems_bond_pricing_order
  ON oems_bond_pricing_locks(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_bond_pricing_route
  ON oems_bond_pricing_locks(approval_route, lock_status);

CREATE TABLE IF NOT EXISTS oems_fx_live_rates (
  id serial PRIMARY KEY,
  rate_id text NOT NULL UNIQUE,
  currency_pair text NOT NULL,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  bid_rate numeric(18,8),
  ask_rate numeric(18,8),
  mid_rate numeric(18,8) NOT NULL,
  source_system text NOT NULL DEFAULT 'TREASURY',
  rate_status text NOT NULL DEFAULT 'AVAILABLE',
  rate_timestamp timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_fx_live_rate_id
  ON oems_fx_live_rates(rate_id);
CREATE INDEX IF NOT EXISTS idx_oems_fx_live_rates_pair
  ON oems_fx_live_rates(currency_pair, rate_timestamp);
CREATE INDEX IF NOT EXISTS idx_oems_fx_live_rates_status
  ON oems_fx_live_rates(rate_status);

CREATE TABLE IF NOT EXISTS oems_fx_today_details (
  id serial PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES oems_orders(order_id),
  currency_pair text NOT NULL,
  dealt_currency text NOT NULL,
  counter_currency text NOT NULL,
  debit_currency text NOT NULL,
  debit_account_no text,
  credit_account_no text,
  amount numeric(21,4) NOT NULL,
  quote_rate numeric(18,8) NOT NULL,
  latest_rate numeric(18,8),
  quote_hash text NOT NULL,
  live_rate_id integer REFERENCES oems_fx_live_rates(id),
  customer_detail_status text NOT NULL DEFAULT 'PENDING',
  account_status text NOT NULL DEFAULT 'PENDING',
  sku_status text NOT NULL DEFAULT 'PENDING',
  pfe_status text NOT NULL DEFAULT 'PENDING',
  digital_auth_status text NOT NULL DEFAULT 'PENDING',
  fallback_verifier_role text,
  treasury_snd_approval_status text NOT NULL DEFAULT 'PENDING',
  lhbu_purpose_code text,
  lhbu_confirmation_status text NOT NULL DEFAULT 'PENDING',
  settlement_status text NOT NULL DEFAULT 'PENDING',
  overbook_status text NOT NULL DEFAULT 'PENDING',
  blotter_status text NOT NULL DEFAULT 'PENDING',
  confirmation_status text NOT NULL DEFAULT 'PENDING',
  confirmation_notice_url text,
  underlying_document_required boolean NOT NULL DEFAULT false,
  underlying_document_id text,
  eod_alert_status text NOT NULL DEFAULT 'NONE',
  source_status jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_fx_today_detail_order
  ON oems_fx_today_details(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_fx_today_detail_pair
  ON oems_fx_today_details(currency_pair, settlement_status);
CREATE INDEX IF NOT EXISTS idx_oems_fx_today_detail_confirmation
  ON oems_fx_today_details(confirmation_status, treasury_snd_approval_status);

CREATE TABLE IF NOT EXISTS oems_fx_today_blotter_entries (
  id serial PRIMARY KEY,
  blotter_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  currency_pair text NOT NULL,
  dealt_currency text NOT NULL,
  amount numeric(21,4) NOT NULL,
  booked_rate numeric(18,8) NOT NULL,
  ncbs_reference text,
  treasury_reference text,
  confirmation_notice_url text,
  blotter_status text NOT NULL DEFAULT 'BOOKED',
  settlement_status text NOT NULL DEFAULT 'PENDING',
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_fx_today_blotter_id
  ON oems_fx_today_blotter_entries(blotter_id);
CREATE INDEX IF NOT EXISTS idx_oems_fx_today_blotter_order
  ON oems_fx_today_blotter_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_oems_fx_today_blotter_status
  ON oems_fx_today_blotter_entries(blotter_status, settlement_status);

INSERT INTO oems_report_definitions (
  report_code,
  report_name,
  report_category,
  product_family,
  allowed_formats,
  filters_schema,
  columns,
  data_sources,
  sync_row_threshold,
  protection_policy,
  history_source_policy,
  created_by
) VALUES
(
  'MF_BOND_WEALTH_CORE_HANDOFF',
  'MF/Bond Wealth Core Handoff and Rejection Report',
  'WEALTH',
  'MUTUAL_FUND',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"productFamily":{"type":"text"},"wealthCoreStatus":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb,
  '["order_id","product_family","transaction_variant","wealth_core_status","wealth_core_order_id","wealth_core_rejection_reason"]'::jsonb,
  '["OEMS","WEALTH_CORE"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential"}'::jsonb,
  '{}'::jsonb,
  'migration'
),
(
  'FX_TODAY_EOD_EXCEPTION',
  'FX Today EOD Settlement Exception Report',
  'FX_TODAY',
  'FX_TODAY',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"settlementStatus":{"type":"text"},"currencyPair":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb,
  '["order_id","currency_pair","amount","quote_rate","latest_rate","settlement_status","overbook_status","eod_alert_status"]'::jsonb,
  '["OEMS","NCBS","TREASURY_SND"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential","passwordPolicy":"ROLE_OR_JOB_PASSWORD"}'::jsonb,
  '{}'::jsonb,
  'migration'
) ON CONFLICT (report_code) DO NOTHING;

DO $$ BEGIN
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'AUTHORIZATION_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'AUTHORIZED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'HOLD_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'HELD';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'HOLD_FAILED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'TREASURY_UPDATE_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'TREASURY_UPDATE_REJECTED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'UNHOLD_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'UNHELD';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'OVERBOOK_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'OVERBOOKED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'MANUAL_OVERBOOK_REQUIRED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'FP8007_SYNC_PENDING';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'FP8007_SYNCED';
  ALTER TYPE oems_oda_lifecycle ADD VALUE IF NOT EXISTS 'EXCEPTION';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE IF EXISTS oems_oda_blotter_groups
  ADD COLUMN IF NOT EXISTS summary_date date,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS currency_pair text,
  ADD COLUMN IF NOT EXISTS order_cost_before_swap numeric(21,4),
  ADD COLUMN IF NOT EXISTS minimum_collective_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS qualifies_minimum_collective boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS treasury_status text,
  ADD COLUMN IF NOT EXISTS fp8007_status text,
  ADD COLUMN IF NOT EXISTS last_fp8007_sync_at timestamptz;

UPDATE oems_oda_blotter_groups
SET summary_date = COALESCE(summary_date, value_date),
    direction = COALESCE(direction, 'BUY'),
    currency_pair = COALESCE(currency_pair, currency || '/IDR')
WHERE summary_date IS NULL OR direction IS NULL OR currency_pair IS NULL;

CREATE INDEX IF NOT EXISTS idx_oems_oda_blotter_grouping
  ON oems_oda_blotter_groups(summary_date, direction, currency_pair, average_rate);

ALTER TABLE IF EXISTS oems_oda_recommendations
  ADD COLUMN IF NOT EXISTS accepted_recommendation_id integer,
  ADD COLUMN IF NOT EXISTS reference_rate_id integer,
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS channel oems_channel NOT NULL DEFAULT 'OEMS_DIRECT',
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'BUY',
  ADD COLUMN IF NOT EXISTS currency_pair text NOT NULL DEFAULT 'USD/IDR',
  ADD COLUMN IF NOT EXISTS dealt_currency text,
  ADD COLUMN IF NOT EXISTS counter_currency text,
  ADD COLUMN IF NOT EXISTS oda_type text NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN IF NOT EXISTS reference_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS order_cost_before_swap numeric(21,4),
  ADD COLUMN IF NOT EXISTS expiry_at timestamptz,
  ADD COLUMN IF NOT EXISTS debit_account_no text,
  ADD COLUMN IF NOT EXISTS credit_account_no text,
  ADD COLUMN IF NOT EXISTS debit_currency text,
  ADD COLUMN IF NOT EXISTS credit_currency text,
  ADD COLUMN IF NOT EXISTS minimum_placement_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS minimum_collective_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS available_balance numeric(21,4),
  ADD COLUMN IF NOT EXISTS ledger_balance numeric(21,4),
  ADD COLUMN IF NOT EXISTS cif_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS sku_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS pfe_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS sales_certification_status text,
  ADD COLUMN IF NOT EXISTS authorization_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS ncbs_hold_status text,
  ADD COLUMN IF NOT EXISTS ncbs_unhold_status text,
  ADD COLUMN IF NOT EXISTS ncbs_overbook_status text,
  ADD COLUMN IF NOT EXISTS auto_settle_result text,
  ADD COLUMN IF NOT EXISTS treasury_status text,
  ADD COLUMN IF NOT EXISTS fp8007_status text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS precheck_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE oems_oda_recommendations
SET currency_pair = COALESCE(currency_pair, currency || '/IDR'),
    direction = COALESCE(direction, 'BUY'),
    dealt_currency = COALESCE(dealt_currency, currency),
    counter_currency = COALESCE(counter_currency, 'IDR'),
    debit_currency = COALESCE(debit_currency, currency),
    credit_currency = COALESCE(credit_currency, 'IDR'),
    order_cost_before_swap = COALESCE(order_cost_before_swap, nominal_amount),
    precheck_result = COALESCE(precheck_result, '{}'::jsonb),
    documents = COALESCE(documents, '[]'::jsonb),
    payload = COALESCE(payload, '{}'::jsonb)
WHERE currency_pair IS NULL
   OR dealt_currency IS NULL
   OR counter_currency IS NULL
   OR debit_currency IS NULL
   OR credit_currency IS NULL
   OR order_cost_before_swap IS NULL
   OR precheck_result IS NULL
   OR documents IS NULL
   OR payload IS NULL;

CREATE INDEX IF NOT EXISTS idx_oems_oda_recommendations_pair_rate
  ON oems_oda_recommendations(currency_pair, direction, rate);

CREATE INDEX IF NOT EXISTS idx_oems_oda_recommendations_cutoff
  ON oems_oda_recommendations(cutoff_at);

CREATE TABLE IF NOT EXISTS oems_oda_reference_rates (
  id serial PRIMARY KEY,
  rate_id text NOT NULL UNIQUE,
  source_system text NOT NULL DEFAULT 'TREASURY',
  retrieval_mode text NOT NULL DEFAULT 'DAILY',
  currency_pair text NOT NULL,
  base_currency text NOT NULL,
  quote_currency text NOT NULL,
  bid_rate numeric(18,8),
  ask_rate numeric(18,8),
  mid_rate numeric(18,8),
  spread_rate numeric(18,8),
  rate_date date NOT NULL,
  rate_timestamp timestamptz NOT NULL DEFAULT now(),
  rate_status text NOT NULL DEFAULT 'AVAILABLE',
  unavailable_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_reference_rate
  ON oems_oda_reference_rates(rate_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_reference_rates_pair_date
  ON oems_oda_reference_rates(currency_pair, rate_date, rate_status);

CREATE TABLE IF NOT EXISTS oems_oda_order_legs (
  id serial PRIMARY KEY,
  recommendation_id integer NOT NULL REFERENCES oems_oda_recommendations(id),
  linked_leg_id integer,
  leg_no integer NOT NULL DEFAULT 1,
  leg_type text NOT NULL DEFAULT 'PRIMARY',
  direction text NOT NULL,
  currency_pair text NOT NULL,
  target_rate numeric(18,8) NOT NULL,
  amount numeric(21,4) NOT NULL,
  leg_status text NOT NULL DEFAULT 'ACTIVE',
  executed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
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

CREATE INDEX IF NOT EXISTS idx_oems_oda_legs_recommendation
  ON oems_oda_order_legs(recommendation_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_legs_status
  ON oems_oda_order_legs(leg_status);

CREATE TABLE IF NOT EXISTS oems_oda_fund_instructions (
  id serial PRIMARY KEY,
  instruction_id text NOT NULL UNIQUE,
  recommendation_id integer NOT NULL REFERENCES oems_oda_recommendations(id),
  order_id text REFERENCES oems_orders(order_id),
  group_id integer REFERENCES oems_oda_blotter_groups(id),
  instruction_type text NOT NULL,
  target_system text NOT NULL DEFAULT 'NCBS',
  idempotency_key text NOT NULL UNIQUE,
  account_no text,
  amount numeric(21,4) NOT NULL,
  currency text NOT NULL,
  instruction_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  sent_at timestamptz,
  acknowledged_at timestamptz,
  failed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  auto_settle_result text,
  failure_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_instruction_id
  ON oems_oda_fund_instructions(instruction_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_instruction_idempotency
  ON oems_oda_fund_instructions(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_oems_oda_fund_instructions_rec
  ON oems_oda_fund_instructions(recommendation_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_fund_instructions_status
  ON oems_oda_fund_instructions(instruction_type, instruction_status);

CREATE TABLE IF NOT EXISTS oems_oda_treasury_updates (
  id serial PRIMARY KEY,
  update_id text NOT NULL UNIQUE,
  group_id integer NOT NULL REFERENCES oems_oda_blotter_groups(id),
  requested_lifecycle oems_oda_lifecycle NOT NULL,
  swap_points numeric(18,8),
  treasury_deal_id text,
  auto_settle_result text,
  update_status text NOT NULL DEFAULT 'PENDING_APPROVAL',
  maker_by text NOT NULL,
  maker_at timestamptz NOT NULL DEFAULT now(),
  checker_by text,
  checker_at timestamptz,
  rejection_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_treasury_update_id
  ON oems_oda_treasury_updates(update_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_treasury_updates_group
  ON oems_oda_treasury_updates(group_id, update_status);

CREATE TABLE IF NOT EXISTS oems_oda_daily_summaries (
  id serial PRIMARY KEY,
  summary_id text NOT NULL UNIQUE,
  summary_date date NOT NULL,
  direction text NOT NULL,
  currency_pair text NOT NULL,
  rate numeric(18,8) NOT NULL,
  order_cost_before_swap numeric(21,4),
  total_nominal numeric(21,4) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  minimum_collective_amount numeric(21,4),
  qualifies_minimum_collective boolean NOT NULL DEFAULT false,
  summary_status text NOT NULL DEFAULT 'OPEN',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_daily_summary_id
  ON oems_oda_daily_summaries(summary_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_daily_summary_group
  ON oems_oda_daily_summaries(summary_date, currency_pair, direction, rate);

CREATE TABLE IF NOT EXISTS oems_oda_fp8007_syncs (
  id serial PRIMARY KEY,
  sync_id text NOT NULL UNIQUE,
  group_id integer REFERENCES oems_oda_blotter_groups(id),
  recommendation_id integer REFERENCES oems_oda_recommendations(id),
  fp8007_status text NOT NULL,
  sync_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  external_ref text,
  synced_at timestamptz,
  failure_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_oda_fp8007_sync_id
  ON oems_oda_fp8007_syncs(sync_id);

CREATE INDEX IF NOT EXISTS idx_oems_oda_fp8007_group
  ON oems_oda_fp8007_syncs(group_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_oems_oda_fp8007_recommendation
  ON oems_oda_fp8007_syncs(recommendation_id);

INSERT INTO oems_report_definitions (
  report_code,
  report_name,
  report_category,
  product_family,
  allowed_formats,
  filters_schema,
  columns,
  data_sources,
  sync_row_threshold,
  protection_policy,
  history_source_policy,
  created_by
) VALUES
(
  'ODA_FUND_RELEASE',
  'ODA Fund Release Report',
  'ODA',
  'ODA',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"dateFrom":{"type":"date"},"dateTo":{"type":"date"},"status":{"type":"text"},"currencyPair":{"type":"text"}}'::jsonb,
  '["instruction_id","recommendation_id","instruction_type","instruction_status","amount","currency","failure_reason","next_retry_at"]'::jsonb,
  '["OEMS","NCBS"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential"}'::jsonb,
  '{}'::jsonb,
  'migration'
),
(
  'ODA_FP8007_SYNC',
  'ODA FP 8007 Sync Report',
  'ODA',
  'ODA',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"dateFrom":{"type":"date"},"dateTo":{"type":"date"},"syncStatus":{"type":"text"},"currencyPair":{"type":"text"}}'::jsonb,
  '["sync_id","group_id","recommendation_id","fp8007_status","sync_status","external_ref","failure_reason"]'::jsonb,
  '["OEMS","FP8007"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential"}'::jsonb,
  '{}'::jsonb,
  'migration'
) ON CONFLICT (report_code) DO NOTHING;

DO $$ BEGIN
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'HOLD_PENDING';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'HELD';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'HOLD_FAILED';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'PRETRADE_RECHECK_PENDING';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'PRETRADE_RECHECK_FAILED';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'FINAL_MASTER_BLOTTER';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'TD_CREATE_PENDING';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'TRADED_PENDING_DEALING_ID';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'MATURITY_PENDING';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'MATURITY_CREDIT_FAILED';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'TERMINATED';
  ALTER TYPE oems_mld_lifecycle ADD VALUE IF NOT EXISTS 'EXCEPTION';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE IF EXISTS oems_mld_tranches
  ADD COLUMN IF NOT EXISTS option_type text,
  ADD COLUMN IF NOT EXISTS underlying_reference text,
  ADD COLUMN IF NOT EXISTS indicative_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS minimum_interest_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS bonus_payout_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS participation_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS strike_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS tax_rate numeric(9,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_collective_nominal numeric(21,4),
  ADD COLUMN IF NOT EXISTS indicative_term_sheet_url text,
  ADD COLUMN IF NOT EXISTS final_term_sheet_url text,
  ADD COLUMN IF NOT EXISTS final_master_blotter_status text,
  ADD COLUMN IF NOT EXISTS treasury_counterparty text,
  ADD COLUMN IF NOT EXISTS treasury_dealing_id text,
  ADD COLUMN IF NOT EXISTS regulatory_report_status text;

CREATE TABLE IF NOT EXISTS oems_mld_order_details (
  id serial PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES oems_orders(order_id),
  tranche_id integer NOT NULL REFERENCES oems_mld_tranches(id),
  customer_id text REFERENCES clients(client_id),
  cif_status text NOT NULL DEFAULT 'PENDING',
  customer_detail_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ninety_day_average_balance numeric(21,4),
  available_balance numeric(21,4),
  balance_currency text,
  mandatory_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  term_sheet_url text,
  product_highlight_sheet_url text,
  participation_form_url text,
  hold_instruction_status oems_integration_status,
  td_creation_status oems_integration_status,
  maturity_credit_status oems_integration_status,
  td_account_no text,
  treasury_dealing_id text,
  callback_status text,
  final_master_blotter_eligible boolean NOT NULL DEFAULT false,
  pretrade_recheck_status text,
  operations_review_reason text,
  fixing_outcome text,
  gross_payout_amount numeric(21,4),
  tax_amount numeric(21,4),
  net_payout_amount numeric(21,4),
  principal_protected boolean NOT NULL DEFAULT true,
  trade_status text,
  maturity_status text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_order_detail_order
  ON oems_mld_order_details(order_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_order_detail_tranche
  ON oems_mld_order_details(tranche_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_order_detail_trade
  ON oems_mld_order_details(trade_status, maturity_status);

CREATE TABLE IF NOT EXISTS oems_mld_fund_instructions (
  id serial PRIMARY KEY,
  instruction_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  tranche_id integer NOT NULL REFERENCES oems_mld_tranches(id),
  instruction_type text NOT NULL,
  target_system text NOT NULL DEFAULT 'NCBS',
  idempotency_key text NOT NULL UNIQUE,
  account_no text,
  amount numeric(21,4) NOT NULL,
  currency text NOT NULL,
  instruction_status oems_integration_status NOT NULL DEFAULT 'QUEUED',
  td_account_no text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  failed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  failure_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_instruction_id
  ON oems_mld_fund_instructions(instruction_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_instruction_idempotency
  ON oems_mld_fund_instructions(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_oems_mld_fund_instructions_order
  ON oems_mld_fund_instructions(order_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_fund_instructions_status
  ON oems_mld_fund_instructions(instruction_type, instruction_status);

CREATE TABLE IF NOT EXISTS oems_mld_pretrade_rechecks (
  id serial PRIMARY KEY,
  recheck_id text NOT NULL UNIQUE,
  tranche_id integer NOT NULL REFERENCES oems_mld_tranches(id),
  order_id text REFERENCES oems_orders(order_id),
  recheck_date date NOT NULL,
  ninety_day_average_balance numeric(21,4),
  order_amount numeric(21,4),
  available_balance numeric(21,4),
  recheck_status text NOT NULL DEFAULT 'PASS',
  excluded_from_final_blotter boolean NOT NULL DEFAULT false,
  review_reason text,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_recheck_id
  ON oems_mld_pretrade_rechecks(recheck_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_rechecks_tranche
  ON oems_mld_pretrade_rechecks(tranche_id, recheck_status);

CREATE TABLE IF NOT EXISTS oems_mld_callbacks (
  id serial PRIMARY KEY,
  callback_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  tranche_id integer REFERENCES oems_mld_tranches(id),
  callback_status text NOT NULL,
  callback_result text,
  callback_channel text,
  callback_by text NOT NULL,
  callback_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_callback_id
  ON oems_mld_callbacks(callback_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_callbacks_order
  ON oems_mld_callbacks(order_id, callback_status);

CREATE TABLE IF NOT EXISTS oems_mld_fixing_outcomes (
  id serial PRIMARY KEY,
  fixing_id text NOT NULL UNIQUE,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  tranche_id integer NOT NULL REFERENCES oems_mld_tranches(id),
  fixing_date date NOT NULL,
  fixing_level numeric(18,8),
  outcome text NOT NULL,
  principal_amount numeric(21,4) NOT NULL,
  minimum_interest_amount numeric(21,4) NOT NULL DEFAULT 0,
  bonus_payout_amount numeric(21,4) NOT NULL DEFAULT 0,
  gross_payout_amount numeric(21,4) NOT NULL,
  tax_amount numeric(21,4) NOT NULL DEFAULT 0,
  net_payout_amount numeric(21,4) NOT NULL,
  tax_rule_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_oems_mld_fixing_id
  ON oems_mld_fixing_outcomes(fixing_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_fixing_order
  ON oems_mld_fixing_outcomes(order_id);

CREATE INDEX IF NOT EXISTS idx_oems_mld_fixing_tranche
  ON oems_mld_fixing_outcomes(tranche_id, outcome);

INSERT INTO oems_report_definitions (
  report_code,
  report_name,
  report_category,
  product_family,
  allowed_formats,
  filters_schema,
  columns,
  data_sources,
  sync_row_threshold,
  protection_policy,
  history_source_policy,
  created_by
) VALUES
(
  'MLD_FINAL_MASTER_BLOTTER',
  'MLD Final Master Blotter',
  'MLD',
  'MLD',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"trancheId":{"type":"number"},"status":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb,
  '["tranche_id","order_id","customer_id","amount","hold_status","td_account_no","treasury_dealing_id","final_master_blotter_eligible"]'::jsonb,
  '["OEMS","NCBS","TREASURY"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential"}'::jsonb,
  '{}'::jsonb,
  'migration'
),
(
  'MLD_MATURITY_PAYOUT',
  'MLD Maturity Payout and Tax Report',
  'MLD',
  'MLD',
  '["XLSX","CSV","PDF"]'::jsonb,
  '{"trancheId":{"type":"number"},"outcome":{"type":"text"},"dateFrom":{"type":"date"},"dateTo":{"type":"date"}}'::jsonb,
  '["order_id","tranche_id","outcome","principal_amount","minimum_interest_amount","bonus_payout_amount","tax_amount","net_payout_amount"]'::jsonb,
  '["OEMS","NCBS"]'::jsonb,
  10000,
  '{"watermark":"Danamon OEMS Confidential","passwordPolicy":"ROLE_OR_JOB_PASSWORD"}'::jsonb,
  '{}'::jsonb,
  'migration'
) ON CONFLICT (report_code) DO NOTHING;
