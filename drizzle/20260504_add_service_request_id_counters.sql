CREATE TABLE IF NOT EXISTS service_request_id_counters (
  counter_year integer PRIMARY KEY,
  last_sequence integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO service_request_id_counters(counter_year, last_sequence)
SELECT
  CAST(SUBSTRING(request_id FROM 4 FOR 4) AS integer) AS counter_year,
  MAX(CAST(SUBSTRING(request_id FROM 9) AS integer)) AS last_sequence
FROM service_requests
WHERE request_id ~ '^SR-[0-9]{4}-[0-9]{6}$'
GROUP BY CAST(SUBSTRING(request_id FROM 4 FOR 4) AS integer)
ON CONFLICT (counter_year) DO UPDATE
SET
  last_sequence = GREATEST(service_request_id_counters.last_sequence, EXCLUDED.last_sequence),
  updated_at = now();
