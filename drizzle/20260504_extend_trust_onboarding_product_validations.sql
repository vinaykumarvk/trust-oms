ALTER TABLE trust_accounts
  ADD COLUMN IF NOT EXISTS onboarding_validation_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS onboarding_validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE trust_mandates
  ADD COLUMN IF NOT EXISTS mandate_validation_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS mandate_validation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE trust_accounts
SET
  onboarding_validation_status = CASE
    WHEN onboarding_validation_status <> 'PENDING' THEN onboarding_validation_status
    ELSE 'PASSED_WITH_WARNINGS'
  END,
  onboarding_validation_evidence = CASE
    WHEN onboarding_validation_evidence <> '{}'::jsonb THEN onboarding_validation_evidence
    ELSE jsonb_build_object(
      'product_type', product_type,
      'base_currency', base_currency,
      'validated_at', COALESCE(opened_at, created_at, now()),
      'source', 'MIGRATION_BACKFILL',
      'warnings', jsonb_build_array('Legacy foundation record backfilled before product-specific validation policy was enforced')
    )
  END;

UPDATE trust_mandates tm
SET
  mandate_validation_status = CASE
    WHEN mandate_validation_status <> 'PENDING' THEN mandate_validation_status
    ELSE 'PASSED_WITH_WARNINGS'
  END,
  mandate_validation_evidence = CASE
    WHEN mandate_validation_evidence <> '{}'::jsonb THEN mandate_validation_evidence
    ELSE jsonb_build_object(
      'mandate_type', tm.mandate_type,
      'trust_account_id', tm.trust_account_id,
      'validated_at', COALESCE(tm.created_at, now()),
      'source', 'MIGRATION_BACKFILL',
      'warnings', jsonb_build_array('Legacy mandate record backfilled before product-specific validation policy was enforced')
    )
  END;

CREATE INDEX IF NOT EXISTS idx_trust_accounts_onboarding_validation_status
  ON trust_accounts(onboarding_validation_status);

CREATE INDEX IF NOT EXISTS idx_trust_mandates_validation_status
  ON trust_mandates(mandate_validation_status);
