CREATE TABLE IF NOT EXISTS suitability_disclosure_versions (
  id serial PRIMARY KEY,
  entity_id text NOT NULL DEFAULT 'default',
  disclosure_code text NOT NULL DEFAULT 'SUITABILITY_STANDARD',
  version_no integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  disclosure_status text NOT NULL DEFAULT 'ACTIVE',
  approved_by integer REFERENCES users(id),
  approved_at timestamptz,
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
  CONSTRAINT ux_suitability_disclosure_version UNIQUE(entity_id, disclosure_code, version_no)
);

CREATE INDEX IF NOT EXISTS idx_suitability_disclosure_active
  ON suitability_disclosure_versions(entity_id, disclosure_code, disclosure_status);

ALTER TABLE investment_proposals
  ADD COLUMN IF NOT EXISTS disclosure_status text NOT NULL DEFAULT 'NOT_PREPARED',
  ADD COLUMN IF NOT EXISTS disclosure_version_id integer REFERENCES suitability_disclosure_versions(id),
  ADD COLUMN IF NOT EXISTS disclosure_evidence_id integer,
  ADD COLUMN IF NOT EXISTS disclosure_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_acceptance_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS proposal_disclosure_evidence (
  id serial PRIMARY KEY,
  proposal_id integer NOT NULL REFERENCES investment_proposals(id),
  risk_profile_id integer NOT NULL REFERENCES customer_risk_profiles(id),
  disclosure_version_id integer NOT NULL REFERENCES suitability_disclosure_versions(id),
  disclosure_code text NOT NULL,
  disclosure_version_no integer NOT NULL,
  disclosure_content_hash text NOT NULL,
  disclosure_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  suitability_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  acceptance_status text NOT NULL DEFAULT 'PENDING',
  accepted_by integer REFERENCES users(id),
  accepted_at timestamptz,
  channel text,
  acceptance_method text,
  ip_address text,
  user_agent text,
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_proposal_disclosure_evidence_proposal
  ON proposal_disclosure_evidence(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_disclosure_evidence_status
  ON proposal_disclosure_evidence(acceptance_status);

INSERT INTO suitability_disclosure_versions (
  entity_id,
  disclosure_code,
  version_no,
  title,
  content,
  content_hash,
  effective_from,
  created_by,
  updated_by
)
VALUES (
  'default',
  'SUITABILITY_STANDARD',
  1,
  'Suitability Disclosure and Client Acknowledgement',
  '{
    "title": "Suitability Disclosure and Client Acknowledgement",
    "sections": [
      {"heading": "Risk Profile Basis", "body": "The recommendation is based on the current client risk profile, investment objective, time horizon, and declared financial circumstances."},
      {"heading": "Suitability Result", "body": "The suitability check compares proposed products, concentration, and acknowledged deviations against the approved client risk profile."},
      {"heading": "Client Responsibility", "body": "The client must review the recommendation, product risks, fees, liquidity limits, and any deviations before accepting the proposal."}
    ],
    "acknowledgementText": "I acknowledge that I reviewed the suitability disclosure and accept the proposal with the recorded suitability result."
  }'::jsonb,
  'e6cbc009cca8915a65d429141594ada2d800456f5322e4f60bcff96b6b343c22',
  CURRENT_DATE,
  'MIGRATION_BACKFILL',
  'MIGRATION_BACKFILL'
)
ON CONFLICT (entity_id, disclosure_code, version_no) DO NOTHING;
