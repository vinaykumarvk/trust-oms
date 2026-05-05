ALTER TABLE trust_related_parties
  ADD COLUMN IF NOT EXISTS party_reference text,
  ADD COLUMN IF NOT EXISTS parent_party_id integer,
  ADD COLUMN IF NOT EXISTS parent_party_reference text,
  ADD COLUMN IF NOT EXISTS relationship_to_account text,
  ADD COLUMN IF NOT EXISTS ownership_path jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS control_type text,
  ADD COLUMN IF NOT EXISTS authority_document_ref text,
  ADD COLUMN IF NOT EXISTS authority_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS authority_verified_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS ubo_threshold_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screening_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screening_case_ref text,
  ADD COLUMN IF NOT EXISTS compliance_review_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_trust_related_parties_reference
  ON trust_related_parties(trust_account_id, party_reference);

CREATE INDEX IF NOT EXISTS idx_trust_related_parties_screening
  ON trust_related_parties(trust_account_id, screening_required);

CREATE INDEX IF NOT EXISTS idx_trust_related_parties_ubo_threshold
  ON trust_related_parties(trust_account_id, ubo_threshold_flag)
  WHERE ubo_threshold_flag = true;
