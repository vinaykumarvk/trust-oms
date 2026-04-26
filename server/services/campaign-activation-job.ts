/**
 * Campaign Activation Job
 *
 * Scheduled daily job that manages campaign lifecycle transitions:
 * - APPROVED campaigns whose start_date <= today -> set to ACTIVE
 * - ACTIVE campaigns whose end_date < today -> set to COMPLETED
 *
 * Can be invoked manually or wired into a cron scheduler.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, lte, lt, sql, inArray } from 'drizzle-orm';

export interface ActivationJobResult {
  activated: number;
  completed: number;
  activated_ids: number[];
  completed_ids: number[];
  run_at: string;
}

/**
 * Run the campaign activation/completion job.
 *
 * 1. Find all APPROVED campaigns where start_date <= today, set to ACTIVE.
 * 2. Find all ACTIVE campaigns where end_date < today, set to COMPLETED.
 */
export async function runActivationJob(): Promise<ActivationJobResult> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Step 1: Activate approved campaigns whose start date has arrived
  const approvedReady = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(and(
      eq(schema.campaigns.campaign_status, 'APPROVED'),
      eq(schema.campaigns.is_deleted, false),
      lte(schema.campaigns.start_date, today),
    ));

  const activatedIds = approvedReady.map((c: { id: number }) => c.id);

  if (activatedIds.length > 0) {
    for (const id of activatedIds) {
      await db
        .update(schema.campaigns)
        .set({
          campaign_status: 'ACTIVE',
          updated_by: 'system-activation-job',
          updated_at: new Date(),
        })
        .where(eq(schema.campaigns.id, id));

      // G-009: On campaign activation, refresh RULE-based lead lists to generate fresh lead records
      try {
        const { leadListService } = await import('./campaign-service');
        const campaignLists = await db
          .select({ lead_list_id: schema.campaignLists.lead_list_id })
          .from(schema.campaignLists)
          .where(eq(schema.campaignLists.campaign_id, id));

        for (const cl of campaignLists) {
          if (!cl.lead_list_id) continue;
          const [list] = await db
            .select({ id: schema.leadLists.id, source_type: schema.leadLists.source_type })
            .from(schema.leadLists)
            .where(eq(schema.leadLists.id, cl.lead_list_id))
            .limit(1);
          if (list?.source_type === 'RULE') {
            await leadListService.executeRule(cl.lead_list_id).catch((err: Error) => {
              console.warn(`[ActivationJob] Failed to refresh list ${cl.lead_list_id} for campaign ${id}:`, err.message);
            });
          }
        }
      } catch (err) {
        console.warn(`[ActivationJob] Lead list refresh skipped for campaign ${id}:`, err);
      }
    }
  }

  // Step 2: Complete active campaigns whose end date has passed
  const activeExpired = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(and(
      eq(schema.campaigns.campaign_status, 'ACTIVE'),
      eq(schema.campaigns.is_deleted, false),
      lt(schema.campaigns.end_date, today),
    ));

  const completedIds = activeExpired.map((c: { id: number }) => c.id);

  if (completedIds.length > 0) {
    for (const id of completedIds) {
      await db
        .update(schema.campaigns)
        .set({
          campaign_status: 'COMPLETED',
          updated_by: 'system-activation-job',
          updated_at: new Date(),
        })
        .where(eq(schema.campaigns.id, id));
    }
  }

  return {
    activated: activatedIds.length,
    completed: completedIds.length,
    activated_ids: activatedIds,
    completed_ids: completedIds,
    run_at: new Date().toISOString(),
  };
}
