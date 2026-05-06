-- ODA Blotter: Deaggregation + Partial Fulfillment Allocation
-- Adds enums, columns, and tables to support order deaggregation and partial fill allocation

-- New enums
DO $$ BEGIN
  CREATE TYPE oems_oda_fill_status AS ENUM ('UNFILLED', 'PARTIAL', 'FULL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE oems_oda_allocation_method AS ENUM ('PROPORTIONATE', 'FIFO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend oems_oda_blotter_groups
ALTER TABLE oems_oda_blotter_groups
  ADD COLUMN IF NOT EXISTS deaggregation_log jsonb,
  ADD COLUMN IF NOT EXISTS original_total_nominal numeric(21,4),
  ADD COLUMN IF NOT EXISTS original_order_count integer,
  ADD COLUMN IF NOT EXISTS executed_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS fill_percentage numeric(7,4),
  ADD COLUMN IF NOT EXISTS allocation_method oems_oda_allocation_method,
  ADD COLUMN IF NOT EXISTS allocation_at timestamptz,
  ADD COLUMN IF NOT EXISTS allocation_by text;

-- Extend oems_oda_recommendations
ALTER TABLE oems_oda_recommendations
  ADD COLUMN IF NOT EXISTS filled_amount numeric(21,4),
  ADD COLUMN IF NOT EXISTS fill_percentage numeric(7,4),
  ADD COLUMN IF NOT EXISTS fill_status oems_oda_fill_status DEFAULT 'UNFILLED',
  ADD COLUMN IF NOT EXISTS allocation_method oems_oda_allocation_method,
  ADD COLUMN IF NOT EXISTS allocation_at timestamptz,
  ADD COLUMN IF NOT EXISTS allocation_by text;

-- Allocation log table
CREATE TABLE IF NOT EXISTS oems_oda_allocation_log (
  id serial PRIMARY KEY,
  log_id text UNIQUE NOT NULL,
  group_id integer NOT NULL REFERENCES oems_oda_blotter_groups(id),
  recommendation_id integer NOT NULL REFERENCES oems_oda_recommendations(id),
  allocation_method oems_oda_allocation_method NOT NULL,
  group_total_nominal numeric(21,4) NOT NULL,
  executed_amount numeric(21,4) NOT NULL,
  order_nominal numeric(21,4) NOT NULL,
  filled_amount numeric(21,4) NOT NULL,
  fill_percentage numeric(7,4) NOT NULL,
  fill_status oems_oda_fill_status NOT NULL,
  sequence_number integer NOT NULL,
  rounding_adjustment numeric(21,4) DEFAULT '0',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_oems_oda_allocation_log_group ON oems_oda_allocation_log(group_id);
CREATE INDEX IF NOT EXISTS idx_oems_oda_allocation_log_recommendation ON oems_oda_allocation_log(recommendation_id);

-- Deaggregation events table
CREATE TABLE IF NOT EXISTS oems_oda_deaggregation_events (
  id serial PRIMARY KEY,
  event_id text UNIQUE NOT NULL,
  group_id integer NOT NULL REFERENCES oems_oda_blotter_groups(id),
  recommendation_id integer NOT NULL REFERENCES oems_oda_recommendations(id),
  previous_lifecycle oems_oda_lifecycle NOT NULL,
  new_lifecycle oems_oda_lifecycle NOT NULL,
  reason text NOT NULL,
  group_total_nominal_before numeric(21,4) NOT NULL,
  group_total_nominal_after numeric(21,4) NOT NULL,
  group_order_count_before integer NOT NULL,
  group_order_count_after integer NOT NULL,
  below_minimum_after boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_oems_oda_deaggregation_group ON oems_oda_deaggregation_events(group_id);
CREATE INDEX IF NOT EXISTS idx_oems_oda_deaggregation_recommendation ON oems_oda_deaggregation_events(recommendation_id);
