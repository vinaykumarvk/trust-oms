/**
 * MLD Barrier Observation Job
 * Monitors fixing levels against barriers for tranches in FIXING_PENDING lifecycle.
 * Run via: npx tsx server/jobs/mld-barrier-observation.ts
 * Schedule: Every 15 minutes during market hours via Cloud Scheduler.
 */
import { Pool } from 'pg';
import { fetchFixingLevel, checkBarrierBreach } from '../services/mld-market-data-client';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('[mld-barrier-obs] DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL });

async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

interface ActiveTranche {
  [key: string]: unknown;
  id: number;
  tranche_code: string;
  underlying_reference: string;
  option_type: string;
  option_style: string;
  upper_limit: string | null;
  lower_limit: string | null;
  observation_period_start: string;
  observation_period_end: string;
  fixing_date: string;
  reference_spot: string | null;
}

async function main() {
  console.log('[mld-barrier-obs] Starting barrier observation run...');
  const today = new Date().toISOString().slice(0, 10);

  // Fetch tranches with active observation periods
  const tranches = await query<ActiveTranche>(`
    SELECT id, tranche_code, underlying_reference, option_type, option_style,
           upper_limit, lower_limit, observation_period_start, observation_period_end,
           fixing_date, reference_spot
    FROM oems_mld_tranches
    WHERE lifecycle IN ('FIXING_PENDING', 'OFFERING_CLOSED', 'CALLBACK_COMPLETED')
      AND is_deleted = false
      AND observation_period_start <= $1
      AND observation_period_end >= $1
      AND underlying_reference IS NOT NULL
  `, [today]);

  console.log(`[mld-barrier-obs] Found ${tranches.length} tranches with active observation periods`);

  let barrierHits = 0;
  let fixingsFetched = 0;
  let errors = 0;

  for (const tranche of tranches) {
    try {
      // Fetch current fixing level
      const fixing = await fetchFixingLevel(tranche.underlying_reference, today);
      if (!fixing) {
        console.warn(`[mld-barrier-obs] No fixing data for ${tranche.underlying_reference} (tranche ${tranche.tranche_code})`);
        continue;
      }
      fixingsFetched++;

      // Store observation record
      await query(`
        INSERT INTO oems_mld_fixing_outcomes (
          fixing_id, order_id, tranche_id, fixing_date, fixing_level, outcome,
          principal_amount, gross_payout_amount, net_payout_amount,
          tax_rule_payload, created_by, updated_by
        )
        SELECT
          'MLD-OBS-' || gen_random_uuid()::text,
          'OBSERVATION',
          $1, $2, $3, 'OBSERVATION',
          0, 0, 0,
          $4::jsonb, 'SYSTEM', 'SYSTEM'
        WHERE NOT EXISTS (
          SELECT 1 FROM oems_mld_fixing_outcomes
          WHERE tranche_id = $1 AND fixing_date = $2 AND outcome = 'OBSERVATION'
        )
      `, [
        tranche.id,
        today,
        fixing.level,
        JSON.stringify({ source: fixing.source, timestamp: fixing.timestamp, underlying: tranche.underlying_reference }),
      ]);

      // Check barrier breach
      const upperLimit = tranche.upper_limit ? Number(tranche.upper_limit) : null;
      const lowerLimit = tranche.lower_limit ? Number(tranche.lower_limit) : null;

      if (upperLimit !== null || lowerLimit !== null) {
        const level = fixing.level;
        let breached = false;
        let breachType: 'UPPER' | 'LOWER' | 'NONE' = 'NONE';

        if (tranche.option_type === 'One Touch') {
          // One Touch: barrier hit = MAX_RETURN
          if (upperLimit !== null && level >= upperLimit) { breached = true; breachType = 'UPPER'; }
        } else if (tranche.option_type === 'No Touch') {
          // No Touch: barrier hit = MIN_RETURN (forfeit bonus)
          if (upperLimit !== null && level >= upperLimit) { breached = true; breachType = 'UPPER'; }
          if (lowerLimit !== null && level <= lowerLimit) { breached = true; breachType = 'LOWER'; }
        } else if (tranche.option_type === 'Double No Touch') {
          // Double No Touch: either barrier hit = MIN_RETURN
          if (upperLimit !== null && level >= upperLimit) { breached = true; breachType = 'UPPER'; }
          if (lowerLimit !== null && level <= lowerLimit) { breached = true; breachType = 'LOWER'; }
        }

        if (breached) {
          barrierHits++;
          console.log(`[mld-barrier-obs] BARRIER HIT: tranche ${tranche.tranche_code}, ${breachType} barrier breached at level ${level}`);

          // Update tranche lifecycle
          await query(`
            UPDATE oems_mld_tranches
            SET lifecycle = 'FIXING_PENDING',
                final_master_blotter_status = $2,
                updated_by = 'SYSTEM', updated_at = NOW()
            WHERE id = $1 AND lifecycle NOT IN ('MATURED', 'TERMINATED', 'CANCELLED')
          `, [tranche.id, `BARRIER_${breachType}_HIT`]);
        }
      }
    } catch (err: any) {
      errors++;
      console.error(`[mld-barrier-obs] Error processing tranche ${tranche.tranche_code}: ${err.message}`);
    }
  }

  console.log(`[mld-barrier-obs] Run complete: ${fixingsFetched} fixings fetched, ${barrierHits} barrier hits, ${errors} errors`);
}

main()
  .catch((err) => { console.error('[mld-barrier-obs] Fatal error:', err); process.exit(1); })
  .finally(() => pool.end());
