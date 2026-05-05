-- TrustFees Pro product-specific fee base support.
-- Adds explicit monetary bases and period metadata needed by instrument-specific formulas.

ALTER TABLE securities
  ADD COLUMN IF NOT EXISTS par_value numeric(21,4),
  ADD COLUMN IF NOT EXISTS day_count_basis text DEFAULT 'ACT_360',
  ADD COLUMN IF NOT EXISTS coupon_day_count integer,
  ADD COLUMN IF NOT EXISTS dividend_day_count integer,
  ADD COLUMN IF NOT EXISTS interest_payment_days integer,
  ADD COLUMN IF NOT EXISTS term_days integer;

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS face_value numeric(21,4),
  ADD COLUMN IF NOT EXISTS principal_balance numeric(21,4),
  ADD COLUMN IF NOT EXISTS notional_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS acquisition_cost numeric(21,4);
