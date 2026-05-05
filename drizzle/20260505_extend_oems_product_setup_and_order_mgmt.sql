-- Migration: Extend OEMS products & MLD tranches for FX ODA / MLD demo scenario checklist
-- Date: 2026-05-05

-- New enum for product approval lifecycle
DO $$ BEGIN
  CREATE TYPE oems_product_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'ACTIVE',
    'REJECTED',
    'INACTIVE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- ALTER oems_products: add ODA-specific fields + approval workflow
-- ============================================================================
ALTER TABLE oems_products
  ADD COLUMN IF NOT EXISTS product_status oems_product_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS currency_pair_from text,
  ADD COLUMN IF NOT EXISTS currency_pair_to text,
  ADD COLUMN IF NOT EXISTS reference_rate_source text,
  ADD COLUMN IF NOT EXISTS oda_transaction_types_allowed jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_date_types_allowed jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS min_placement_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS min_collective_order_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS spread_tolerance_percent numeric(9,6),
  ADD COLUMN IF NOT EXISTS cutoff_intraday text,
  ADD COLUMN IF NOT EXISTS cutoff_overnight text,
  ADD COLUMN IF NOT EXISTS cutoff_gtd text,
  ADD COLUMN IF NOT EXISTS cutoff_timezone text DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS eligible_account_types jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS eligible_account_codes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sales_cert_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_cert_type text,
  ADD COLUMN IF NOT EXISTS sales_cert_expiry_mode text,
  ADD COLUMN IF NOT EXISTS trade_ideas_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_ideas_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS trade_ideas_message text,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- Data migration: existing active products become ACTIVE status
UPDATE oems_products SET product_status = 'ACTIVE' WHERE is_active = true AND product_status = 'DRAFT';

-- Index on product_status
CREATE INDEX IF NOT EXISTS idx_oems_products_status ON oems_products (product_status);

-- ============================================================================
-- ALTER oems_mld_tranches: add MLD-specific fields + approval workflow
-- ============================================================================
ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS product_status oems_product_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS option_style text,
  ADD COLUMN IF NOT EXISTS observation_period_start date,
  ADD COLUMN IF NOT EXISTS observation_period_end date,
  ADD COLUMN IF NOT EXISTS reference_spot numeric(18,8),
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS upper_limit numeric(18,8),
  ADD COLUMN IF NOT EXISTS lower_limit numeric(18,8),
  ADD COLUMN IF NOT EXISTS calculating_agent text,
  ADD COLUMN IF NOT EXISTS max_interest_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS early_termination_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_validation_mode text DEFAULT 'AVAILABLE_BALANCE',
  ADD COLUMN IF NOT EXISTS risk_rating text,
  ADD COLUMN IF NOT EXISTS suitability_check_mode text DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS required_documents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS term_sheet_file_path text,
  ADD COLUMN IF NOT EXISTS cutoff_time text,
  ADD COLUMN IF NOT EXISTS cutoff_timezone text DEFAULT 'Asia/Jakarta',
  ADD COLUMN IF NOT EXISTS eligible_account_types jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sales_cert_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_cert_type text,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS tenor integer;

-- Data migration: existing OFFERING tranches become ACTIVE
UPDATE oems_mld_tranches SET product_status = 'ACTIVE' WHERE lifecycle = 'OFFERING' AND product_status = 'DRAFT';

-- Index on product_status
CREATE INDEX IF NOT EXISTS idx_oems_mld_tranches_product_status ON oems_mld_tranches (product_status);

-- ============================================================================
-- New table: oems_oda_trade_confirmations
-- ============================================================================
CREATE TABLE IF NOT EXISTS oems_oda_trade_confirmations (
  id serial PRIMARY KEY,
  confirmation_no text UNIQUE NOT NULL,
  recommendation_id integer NOT NULL,
  group_id integer,
  execution_status text NOT NULL DEFAULT 'PENDING',
  deal_reference text,
  execution_date date,
  execution_time text,
  auto_settle_flag boolean DEFAULT false,
  expiry_reason text,
  observation_notes text,
  confirmation_status text NOT NULL DEFAULT 'DRAFT',
  maker_by text,
  maker_at timestamptz,
  checker_by text,
  checker_at timestamptz,
  rejection_reason text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  updated_by text
);

CREATE INDEX IF NOT EXISTS idx_oems_oda_trade_conf_rec ON oems_oda_trade_confirmations (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_oems_oda_trade_conf_group ON oems_oda_trade_confirmations (group_id);
CREATE INDEX IF NOT EXISTS idx_oems_oda_trade_conf_status ON oems_oda_trade_confirmations (confirmation_status);
