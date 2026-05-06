-- Migration: Add missing columns to oems_mld_tranches
-- Generated: 2026-05-06
-- Source: schema.ts vs cloud DB diff
--
-- The oems_product_status enum already exists with values:
--   {DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, INACTIVE}
-- No new enum types needed.

-- ============================================================
-- oems_mld_tranches — 28 missing columns + 1 missing index
-- ============================================================

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS product_status oems_product_status NOT NULL DEFAULT 'DRAFT';

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS option_style text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS observation_period_start date;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS observation_period_end date;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS reference_spot numeric(18,8);

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS data_source text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS upper_limit numeric(18,8);

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS lower_limit numeric(18,8);

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS calculating_agent text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS max_interest_rate numeric(18,8);

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS early_termination_allowed boolean DEFAULT false;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS balance_validation_mode text DEFAULT 'AVAILABLE_BALANCE';

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS risk_rating text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS suitability_check_mode text DEFAULT 'STANDARD';

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS required_documents jsonb DEFAULT '[]'::jsonb;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS term_sheet_file_path text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS cutoff_time text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS cutoff_timezone text DEFAULT 'Asia/Jakarta';

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS eligible_account_types jsonb DEFAULT '[]'::jsonb;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS sales_cert_required boolean DEFAULT false;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS sales_cert_type text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS submitted_by text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

ALTER TABLE oems_mld_tranches
  ADD COLUMN IF NOT EXISTS tenor integer;

-- Missing index
CREATE INDEX IF NOT EXISTS idx_oems_mld_tranches_product_status
  ON oems_mld_tranches (product_status);
