/**
 * TrustOMS Feature Compute Job
 *
 * Runs SQL aggregations against trust-banking-db and pushes computed
 * feature values to the Platform Feature Service ingest API.
 *
 * Usage:
 *   tsx server/jobs/compute-features.ts
 *   NODE_ENV=production tsx server/jobs/compute-features.ts
 *
 * Required env vars:
 *   DATABASE_URL          — trust-banking-db PostgreSQL connection string
 *   PLATFORM_FEATURE_SERVICE_URL — e.g. https://feature-service-xxx.run.app
 *   PLATFORM_FEATURE_API_KEY     — e.g. wms-internal
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// ── Config ──────────────────────────────────────────────────────────────────

const DB_URL   = process.env.DATABASE_URL;
const FS_URL   = process.env.PLATFORM_FEATURE_SERVICE_URL;
const FS_KEY   = process.env.PLATFORM_FEATURE_API_KEY;
const SOURCE   = 'trustoms-compute-job';

if (!DB_URL || !FS_URL || !FS_KEY) {
  console.error('FATAL: DATABASE_URL, PLATFORM_FEATURE_SERVICE_URL, and PLATFORM_FEATURE_API_KEY must be set');
  process.exit(1);
}

// After the guard above, all three vars are guaranteed to be strings.
const FEATURE_API_KEY = FS_KEY as string;

const pool = new Pool({ connectionString: DB_URL });

// ── Types ───────────────────────────────────────────────────────────────────

interface IngestItem {
  feature_id:   string;
  entity_type:  string;
  entity_id:    string;
  value:        number | null;
  source:       string;
  as_of_ts?:    string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

async function ingestBatch(items: IngestItem[]): Promise<void> {
  if (!items.length) return;

  const res = await fetch(`${FS_URL}/api/v1/ingest/batch`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    FEATURE_API_KEY,
    },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ingest batch failed: ${res.status} ${body}`);
  }
}

function toItems(
  rows: Array<{ entity_id: string; value: unknown }>,
  featureId:  string,
  entityType: string,
): IngestItem[] {
  return rows.map((r) => ({
    feature_id:  featureId,
    entity_type: entityType,
    entity_id:   String(r.entity_id),
    value:       r.value !== null ? Number(r.value) : null,
    source:      SOURCE,
    as_of_ts:    new Date().toISOString(),
  }));
}

// ── Feature SQL definitions ──────────────────────────────────────────────────

type FeatureDef = {
  feature_id:  string;
  entity_type: string;
  sql:         string;
};

const FEATURES: FeatureDef[] = [

  // ─── RM / user features ─────────────────────────────────────────────────

  {
    feature_id:  'rm.book_aum_php',
    entity_type: 'user',
    sql: `
      SELECT c.assigned_rm_id::text AS entity_id,
             COALESCE(SUM(p.aum), 0) AS value
      FROM   clients c
      JOIN   portfolios p ON p.client_id = c.client_id AND p.is_deleted = false
      WHERE  c.is_deleted = false
        AND  c.assigned_rm_id IS NOT NULL
      GROUP  BY c.assigned_rm_id
    `,
  },

  {
    feature_id:  'rm.client_count',
    entity_type: 'user',
    sql: `
      SELECT assigned_rm_id::text AS entity_id,
             COUNT(*) AS value
      FROM   clients
      WHERE  is_deleted = false
        AND  assigned_rm_id IS NOT NULL
        AND  client_status = 'ACTIVE'
      GROUP  BY assigned_rm_id
    `,
  },

  {
    feature_id:  'rm.portfolio_count',
    entity_type: 'user',
    sql: `
      SELECT c.assigned_rm_id::text AS entity_id,
             COUNT(p.portfolio_id) AS value
      FROM   clients c
      JOIN   portfolios p ON p.client_id = c.client_id AND p.is_deleted = false
      WHERE  c.is_deleted = false
        AND  c.assigned_rm_id IS NOT NULL
      GROUP  BY c.assigned_rm_id
    `,
  },

  {
    feature_id:  'rm.overdue_call_reports',
    entity_type: 'user',
    sql: `
      SELECT filed_by AS entity_id,
             COUNT(*) AS value
      FROM   call_reports
      WHERE  is_deleted = false
        AND  filed_by IS NOT NULL
        AND  report_status = 'DRAFT'
        AND  meeting_date < NOW() - INTERVAL '5 days'
      GROUP  BY filed_by
    `,
  },

  {
    feature_id:  'rm.service_requests_open',
    entity_type: 'user',
    sql: `
      SELECT c.assigned_rm_id::text AS entity_id,
             COUNT(sr.id) AS value
      FROM   service_requests sr
      JOIN   clients c ON c.client_id = sr.client_id
      WHERE  sr.is_deleted = false
        AND  c.is_deleted = false
        AND  c.assigned_rm_id IS NOT NULL
        AND  sr.sr_status NOT IN ('COMPLETED', 'REJECTED', 'CLOSED')
      GROUP  BY c.assigned_rm_id
    `,
  },

  {
    // Heuristic: overdue reports × 2 + open SRs weight
    feature_id:  'rm.next_best_action_score',
    entity_type: 'user',
    sql: `
      WITH overdue AS (
        SELECT filed_by::text AS rm_id, COUNT(*)::numeric AS cnt
        FROM   call_reports
        WHERE  is_deleted = false AND filed_by IS NOT NULL
          AND  report_status = 'DRAFT' AND meeting_date < NOW() - INTERVAL '5 days'
        GROUP  BY filed_by
      ),
      open_sr AS (
        SELECT sub.rm_id, COUNT(*)::numeric AS cnt
        FROM (
          SELECT c.assigned_rm_id::text AS rm_id
          FROM   service_requests sr
          JOIN   clients c ON c.client_id = sr.client_id
          WHERE  sr.is_deleted = false AND c.is_deleted = false
            AND  c.assigned_rm_id IS NOT NULL
            AND  sr.sr_status NOT IN ('COMPLETED','REJECTED','CLOSED')
        ) sub
        GROUP  BY sub.rm_id
      ),
      rms AS (
        SELECT DISTINCT assigned_rm_id::text AS rm_id
        FROM clients
        WHERE is_deleted = false AND assigned_rm_id IS NOT NULL
      )
      SELECT r.rm_id AS entity_id,
             ROUND(COALESCE(o.cnt, 0::numeric)*2 + COALESCE(s.cnt, 0::numeric), 2) AS value
      FROM   rms r
      LEFT   JOIN overdue  o ON o.rm_id = r.rm_id
      LEFT   JOIN open_sr  s ON s.rm_id = r.rm_id
    `,
  },

  // ─── Client features ─────────────────────────────────────────────────────

  {
    feature_id:  'client.aum_php',
    entity_type: 'client',
    sql: `
      SELECT c.client_id AS entity_id,
             COALESCE(SUM(p.aum), 0) AS value
      FROM   clients c
      LEFT   JOIN portfolios p ON p.client_id = c.client_id AND p.is_deleted = false
      WHERE  c.is_deleted = false
      GROUP  BY c.client_id
    `,
  },

  {
    feature_id:  'client.risk_score',
    entity_type: 'client',
    sql: `
      SELECT customer_id AS entity_id,
             total_raw_score AS value
      FROM   customer_risk_profiles
      WHERE  is_deleted = false
        AND  is_active = true
    `,
  },

  {
    feature_id:  'client.kyc_days_to_expiry',
    entity_type: 'client',
    sql: `
      SELECT client_id AS entity_id,
             (next_review_date - CURRENT_DATE) AS value
      FROM   kyc_cases
      WHERE  status != 'deleted'
        AND  kyc_status = 'VERIFIED'
        AND  next_review_date IS NOT NULL
    `,
  },

  {
    feature_id:  'client.open_service_requests',
    entity_type: 'client',
    sql: `
      SELECT client_id AS entity_id,
             COUNT(*) AS value
      FROM   service_requests
      WHERE  is_deleted = false
        AND  sr_status NOT IN ('COMPLETED', 'REJECTED', 'CLOSED')
      GROUP  BY client_id
    `,
  },

  {
    feature_id:  'client.last_contact_age_days',
    entity_type: 'client',
    sql: `
      SELECT client_id AS entity_id,
             EXTRACT(day FROM NOW() - MAX(filed_date))::integer AS value
      FROM   call_reports
      WHERE  is_deleted = false
        AND  client_id IS NOT NULL
        AND  report_status IN ('SUBMITTED', 'APPROVED')
      GROUP  BY client_id
    `,
  },

  {
    // NBA: days-since-contact + 3 × overdue KYC flag
    feature_id:  'client.next_best_action_score',
    entity_type: 'client',
    sql: `
      WITH contact AS (
        SELECT client_id,
               EXTRACT(day FROM NOW() - MAX(filed_date)) AS days_since
        FROM   call_reports
        WHERE  is_deleted = false AND client_id IS NOT NULL
          AND  report_status IN ('SUBMITTED', 'APPROVED')
        GROUP  BY client_id
      ),
      kyc AS (
        SELECT client_id,
               CASE WHEN next_review_date < CURRENT_DATE THEN 1 ELSE 0 END AS overdue
        FROM   kyc_cases
        WHERE  kyc_status = 'VERIFIED' AND next_review_date IS NOT NULL
      )
      SELECT c.client_id AS entity_id,
             ROUND(COALESCE(ct.days_since, 90) + COALESCE(k.overdue, 0)*3, 2) AS value
      FROM   clients c
      LEFT   JOIN contact ct ON ct.client_id = c.client_id
      LEFT   JOIN kyc     k  ON k.client_id  = c.client_id
      WHERE  c.is_deleted = false
    `,
  },

  // ─── Portfolio features ───────────────────────────────────────────────────

  {
    feature_id:  'portfolio.market_value_php',
    entity_type: 'portfolio',
    sql: `
      SELECT portfolio_id AS entity_id,
             COALESCE(SUM(market_value), 0) AS value
      FROM   positions
      WHERE  is_deleted = false
      GROUP  BY portfolio_id
    `,
  },

  {
    feature_id:  'portfolio.return_ytd',
    entity_type: 'portfolio',
    sql: `
      WITH jan1 AS (
        SELECT portfolio_id,
               total_nav AS nav_jan1
        FROM   nav_computations
        WHERE  computation_date = (
          SELECT MIN(computation_date)
          FROM   nav_computations nc2
          WHERE  nc2.portfolio_id = nav_computations.portfolio_id
            AND  EXTRACT(year FROM computation_date) = EXTRACT(year FROM NOW())
        )
        AND is_deleted = false
      ),
      latest AS (
        SELECT portfolio_id,
               total_nav AS nav_latest
        FROM   nav_computations
        WHERE  computation_date = (
          SELECT MAX(computation_date)
          FROM   nav_computations nc2
          WHERE  nc2.portfolio_id = nav_computations.portfolio_id
        )
        AND is_deleted = false
      )
      SELECT l.portfolio_id AS entity_id,
             CASE WHEN j.nav_jan1 > 0
               THEN ROUND(((l.nav_latest - j.nav_jan1) / j.nav_jan1) * 100, 4)
               ELSE NULL
             END AS value
      FROM   latest l
      LEFT   JOIN jan1 j ON j.portfolio_id = l.portfolio_id
    `,
  },

  {
    // Risk score = weighted avg of positions by market_value using securities.risk_product_category
    // risk_product_category: CONSERVATIVE=1, MODERATE=3, AGGRESSIVE=5 (heuristic)
    feature_id:  'portfolio.risk_score',
    entity_type: 'portfolio',
    sql: `
      SELECT p.portfolio_id AS entity_id,
             ROUND(
               SUM(
                 pos.market_value *
                 CASE s.risk_product_category
                   WHEN 'CONSERVATIVE' THEN 1
                   WHEN 'MODERATE'     THEN 3
                   WHEN 'AGGRESSIVE'   THEN 5
                   ELSE 3
                 END
               ) / NULLIF(SUM(pos.market_value), 0),
             2) AS value
      FROM   portfolios p
      JOIN   positions  pos ON pos.portfolio_id = p.portfolio_id AND pos.is_deleted = false
      JOIN   securities s   ON s.id = pos.security_id AND s.is_deleted = false
      WHERE  p.is_deleted = false
      GROUP  BY p.portfolio_id
    `,
  },

  {
    // Cash % = positions in asset_class='CASH' / total market value * 100
    feature_id:  'portfolio.cash_pct',
    entity_type: 'portfolio',
    sql: `
      SELECT portfolio_id AS entity_id,
             ROUND(
               100.0 * SUM(CASE WHEN s.asset_class = 'CASH' THEN pos.market_value ELSE 0 END)
                       / NULLIF(SUM(pos.market_value), 0),
             2) AS value
      FROM   positions pos
      JOIN   securities s ON s.id = pos.security_id AND s.is_deleted = false
      WHERE  pos.is_deleted = false
      GROUP  BY pos.portfolio_id
    `,
  },

  {
    feature_id:  'portfolio.compliance_breach_count',
    entity_type: 'portfolio',
    sql: `
      SELECT portfolio_id AS entity_id,
             COUNT(*) AS value
      FROM   compliance_breaches
      WHERE  is_deleted = false
        AND  resolved_at IS NULL
      GROUP  BY portfolio_id
    `,
  },

  {
    feature_id:  'portfolio.last_nav_age_days',
    entity_type: 'portfolio',
    sql: `
      SELECT portfolio_id AS entity_id,
             EXTRACT(day FROM NOW() - MAX(computation_date))::integer AS value
      FROM   nav_computations
      WHERE  is_deleted = false
      GROUP  BY portfolio_id
    `,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[compute-features] Starting — ${new Date().toISOString()}`);
  console.log(`[compute-features] Target: ${FS_URL}`);
  console.log(`[compute-features] Features: ${FEATURES.length}`);

  let totalRows = 0;
  let errors    = 0;

  for (const feat of FEATURES) {
    try {
      const rows = await query<{ entity_id: string; value: unknown }>(feat.sql);
      const items = toItems(rows, feat.feature_id, feat.entity_type);

      if (items.length === 0) {
        console.log(`  [SKIP]  ${feat.feature_id} — no rows`);
        continue;
      }

      await ingestBatch(items);
      console.log(`  [OK]    ${feat.feature_id} — ${items.length} entities`);
      totalRows += items.length;

    } catch (err) {
      console.error(`  [FAIL]  ${feat.feature_id}: ${err instanceof Error ? err.message : err}`);
      errors++;
    }
  }

  console.log(`\n[compute-features] Done — ${totalRows} values ingested, ${errors} errors`);
  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[compute-features] Fatal:', err);
  process.exit(1);
});
