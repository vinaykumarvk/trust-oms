BEGIN;

DROP TABLE IF EXISTS oems_wealth_lending_cure_actions;
DROP TABLE IF EXISTS oems_wealth_lending_instructions;
DROP TABLE IF EXISTS oems_wealth_lending_outstanding_snapshots;
DROP TABLE IF EXISTS oems_wealth_lending_market_prices;

DROP INDEX IF EXISTS idx_oems_lending_cure;
DROP INDEX IF EXISTS idx_oems_collateral_price;

ALTER TABLE oems_m2m_runs
  DROP COLUMN IF EXISTS cure_due_at,
  DROP COLUMN IF EXISTS cure_status,
  DROP COLUMN IF EXISTS top_up_required,
  DROP COLUMN IF EXISTS repayment_required,
  DROP COLUMN IF EXISTS overdraft_limit_amount;

ALTER TABLE oems_wealth_lending_collaterals
  DROP COLUMN IF EXISTS last_price_at,
  DROP COLUMN IF EXISTS maturity_date,
  DROP COLUMN IF EXISTS stale_tolerance_days,
  DROP COLUMN IF EXISTS stale_price_allowed,
  DROP COLUMN IF EXISTS price_status,
  DROP COLUMN IF EXISTS last_price,
  DROP COLUMN IF EXISTS source_system;

ALTER TABLE oems_wealth_lending_facilities
  DROP COLUMN IF EXISTS defaulted_at,
  DROP COLUMN IF EXISTS last_outstanding_refresh_at,
  DROP COLUMN IF EXISTS last_price_refresh_at,
  DROP COLUMN IF EXISTS cure_period_days,
  DROP COLUMN IF EXISTS collateral_decrease_percent,
  DROP COLUMN IF EXISTS top_up_required,
  DROP COLUMN IF EXISTS repayment_required,
  DROP COLUMN IF EXISTS cure_due_at,
  DROP COLUMN IF EXISTS cure_status,
  DROP COLUMN IF EXISTS overdraft_block_status,
  DROP COLUMN IF EXISTS limit_update_status,
  DROP COLUMN IF EXISTS sales_visibility_status,
  DROP COLUMN IF EXISTS dbank_visibility_status,
  DROP COLUMN IF EXISTS loan_account_no,
  DROP COLUMN IF EXISTS core_banking_ref,
  DROP COLUMN IF EXISTS loan_system_ref;

ALTER TABLE oems_integration_adapter_executions
  DROP COLUMN IF EXISTS encryption_profile_ref,
  DROP COLUMN IF EXISTS payload_encrypted,
  DROP COLUMN IF EXISTS response_payload_masked,
  DROP COLUMN IF EXISTS request_payload_masked,
  DROP COLUMN IF EXISTS security_decision,
  DROP COLUMN IF EXISTS destination_address,
  DROP COLUMN IF EXISTS source_address;

ALTER TABLE oems_integration_adapters
  DROP COLUMN IF EXISTS security_policy_status,
  DROP COLUMN IF EXISTS transport_policy,
  DROP COLUMN IF EXISTS encryption_profile_ref,
  DROP COLUMN IF EXISTS encryption_required,
  DROP COLUMN IF EXISTS mask_log_payloads,
  DROP COLUMN IF EXISTS encrypted_field_paths,
  DROP COLUMN IF EXISTS sensitive_field_paths,
  DROP COLUMN IF EXISTS payload_classification,
  DROP COLUMN IF EXISTS allowed_source_cidrs,
  DROP COLUMN IF EXISTS allowed_address_patterns,
  DROP COLUMN IF EXISTS require_tls;

COMMIT;
