ALTER TABLE tax_events
  ADD COLUMN IF NOT EXISTS calculation_payload jsonb;
