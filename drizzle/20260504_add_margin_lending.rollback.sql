-- Rollback for Margin Lending module from WQ Margin Lending V1.0 CCV1.0

DROP TABLE IF EXISTS ml_audit_events;
DROP TABLE IF EXISTS ml_simulation_runs;
DROP TABLE IF EXISTS ml_eod_runs;
DROP TABLE IF EXISTS ml_margin_call_actions;
DROP TABLE IF EXISTS ml_margin_call_cases;
DROP TABLE IF EXISTS ml_asset_settings;
DROP TABLE IF EXISTS ml_portfolio_links;
DROP TABLE IF EXISTS ml_facilities;
DROP TABLE IF EXISTS ml_facility_groups;
DROP TABLE IF EXISTS ml_cross_currency_haircuts;
DROP TABLE IF EXISTS ml_exposure_limits;
DROP TABLE IF EXISTS ml_scrip_settings;
DROP TABLE IF EXISTS ml_references;
DROP TABLE IF EXISTS ml_attribute_settings;
