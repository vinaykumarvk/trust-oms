-- Migration: Add order charges table + settlement columns on oems_orders
-- Date: 2026-05-06

-- 1. New enum for charge rate types
DO $$ BEGIN
  CREATE TYPE oems_charge_rate_type AS ENUM ('PERCENTAGE', 'FLAT', 'PER_UNIT', 'INFORMATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns on oems_orders for settlement summary
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS gross_amount numeric(21,4);
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS total_charges numeric(21,4);
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS total_tax numeric(21,4);
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS net_amount numeric(21,4);
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS settlement_amount numeric(21,4);
ALTER TABLE oems_orders ADD COLUMN IF NOT EXISTS indicative_settlement_date date;

-- 3. Order charges line-item table
CREATE TABLE IF NOT EXISTS oems_order_charges (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES oems_orders(order_id),
  charge_type text NOT NULL,
  charge_label text NOT NULL,
  rate_type oems_charge_rate_type NOT NULL DEFAULT 'PERCENTAGE',
  rate_value numeric(18,8),
  base_amount numeric(21,4),
  charge_amount numeric(21,4) NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  is_deducted boolean NOT NULL DEFAULT true,
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

CREATE INDEX IF NOT EXISTS idx_oems_order_charges_order ON oems_order_charges(order_id);
