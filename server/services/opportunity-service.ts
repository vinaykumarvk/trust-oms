/**
 * Opportunity Pipeline Service (CRM-OPP)
 *
 * Handles opportunity CRUD, stage progression, pipeline analytics,
 * and campaign ROI contribution for WON opportunities.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, lt, notInArray } from 'drizzle-orm';
import { DEFAULT_CURRENCY } from '../constants/crm';

type Opportunity = typeof schema.opportunities.$inferSelect;

const VALID_STAGES = ['IDENTIFIED', 'QUALIFYING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
const TERMINAL_STAGES = ['WON', 'LOST', 'EXPIRED'] as const;
const STAGE_ORDER: Record<string, number> = {
  IDENTIFIED: 0, QUALIFYING: 1, PROPOSAL: 2, NEGOTIATION: 3, WON: 4, LOST: 5,
};

async function generateOpportunityCode(): Promise<string> {
  const result = await db.execute(sql`SELECT opportunity_code FROM opportunities ORDER BY id DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).opportunity_code;
    const lastSeq = parseInt(lastCode.replace('OPP-', ''), 10);
    nextSeq = lastSeq + 1;
  }
  return `OPP-${String(nextSeq).padStart(6, '0')}`;
}

export const opportunityService = {
  async create(data: {
    name: string;
    lead_id?: number;
    prospect_id?: number;
    client_id?: string;
    campaign_id?: number;
    call_report_id?: number;
    product_type?: string;
    pipeline_value?: string;
    pipeline_currency?: string;
    probability?: number;
    expected_close_date?: string;
    created_by?: number | string;
  }): Promise<Opportunity> {
    // P2-15: Probability must be 0-100
    if (data.probability !== undefined && (data.probability < 0 || data.probability > 100)) {
      throw new Error('Probability must be between 0 and 100');
    }
    // P2-16: expected_close_date must not be in the past
    if (data.expected_close_date) {
      const today = new Date().toISOString().split('T')[0];
      if (data.expected_close_date < today) {
        throw new Error('expected_close_date cannot be in the past');
      }
    }
    // BR-043: pipeline_value must be positive when provided
    if (data.pipeline_value !== undefined && data.pipeline_value !== null) {
      const numVal = parseFloat(data.pipeline_value);
      if (!isNaN(numVal) && numVal <= 0) {
        throw new Error('pipeline_value must be greater than 0');
      }
    }
    const opportunity_code = await generateOpportunityCode();

    const [opp] = await db.insert(schema.opportunities).values({
      opportunity_code,
      name: data.name,
      lead_id: data.lead_id,
      prospect_id: data.prospect_id,
      client_id: data.client_id,
      campaign_id: data.campaign_id,
      call_report_id: data.call_report_id,
      product_type: data.product_type,
      pipeline_value: data.pipeline_value,
      pipeline_currency: data.pipeline_currency || DEFAULT_CURRENCY,
      probability: data.probability,
      expected_close_date: data.expected_close_date,
      stage: 'IDENTIFIED',
    }).returning();

    await db.insert(schema.conversationHistory).values({
      lead_id: opp.lead_id ?? null,
      prospect_id: opp.prospect_id ?? null,
      client_id: opp.client_id ?? null,
      interaction_type: 'NOTE',
      interaction_date: new Date(),
      summary: `Opportunity "${opp.name}" (${opp.opportunity_code}) created`,
      reference_type: 'opportunity',
      reference_id: opp.id,
      created_by: data.created_by != null ? String(data.created_by) : null,
    } as any);

    return opp;
  },

  async getById(id: number): Promise<Opportunity> {
    const [opp] = await db.select().from(schema.opportunities)
      .where(eq(schema.opportunities.id, id));
    if (!opp) throw new Error('Opportunity not found');
    return opp;
  },

  async update(id: number, data: Partial<{
    name: string;
    product_type: string;
    pipeline_value: string;
    pipeline_currency: string;
    probability: number;
    expected_close_date: string;
  }>): Promise<Opportunity> {
    // P2-15: Probability must be 0-100
    if (data.probability !== undefined && (data.probability < 0 || data.probability > 100)) {
      throw new Error('Probability must be between 0 and 100');
    }
    // P2-16: expected_close_date must not be in the past
    if (data.expected_close_date) {
      const today = new Date().toISOString().split('T')[0];
      if (data.expected_close_date < today) {
        throw new Error('expected_close_date cannot be in the past');
      }
    }
    type OppUpdate = Partial<typeof schema.opportunities.$inferInsert>;
    const allowedFields: OppUpdate = {};
    if (data.name !== undefined) allowedFields.name = data.name;
    if (data.product_type !== undefined) allowedFields.product_type = data.product_type;
    if (data.pipeline_value !== undefined) allowedFields.pipeline_value = data.pipeline_value;
    if (data.pipeline_currency !== undefined) allowedFields.pipeline_currency = data.pipeline_currency;
    if (data.probability !== undefined) allowedFields.probability = data.probability;
    if (data.expected_close_date !== undefined) allowedFields.expected_close_date = data.expected_close_date;

    const [opp] = await db.select().from(schema.opportunities).where(eq(schema.opportunities.id, id));
    if (!opp) throw new Error('Opportunity not found');

    const [updated] = await db.update(schema.opportunities)
      .set(allowedFields)
      .where(eq(schema.opportunities.id, id))
      .returning();

    // AC-007-5: ConversationHistory entry on significant field updates
    const changedFields = Object.keys(allowedFields).join(', ');
    if (changedFields) {
      await db.insert(schema.conversationHistory).values({
        lead_id: opp.lead_id ?? null,
        prospect_id: opp.prospect_id ?? null,
        client_id: opp.client_id ?? null,
        interaction_type: 'NOTE',
        interaction_date: new Date(),
        summary: `Opportunity "${opp.name}" (${opp.opportunity_code}) updated fields: ${changedFields}`,
        reference_type: 'opportunity',
        reference_id: id,
      } as any);
    }

    return updated;
  },

  async updateStage(id: number, newStage: string, loss_reason?: string): Promise<Opportunity> {
    if (!VALID_STAGES.includes(newStage as any)) {
      throw new Error(`Invalid stage: ${newStage}`);
    }

    const [opp] = await db.select().from(schema.opportunities)
      .where(eq(schema.opportunities.id, id));
    if (!opp) throw new Error('Opportunity not found');

    if (TERMINAL_STAGES.includes(opp.stage as typeof TERMINAL_STAGES[number])) {
      throw new Error('Cannot change stage of WON or LOST opportunities; EXPIRED opportunities are also terminal');
    }

    if (newStage === 'LOST' && (!loss_reason || loss_reason.trim().length === 0)) {
      throw new Error('loss_reason is mandatory for LOST stage');
    }

    type OppUpdate = Partial<typeof schema.opportunities.$inferInsert>;
    const updates: OppUpdate = { stage: newStage as typeof schema.opportunities.$inferInsert['stage'] };
    if (newStage === 'LOST') {
      updates.loss_reason = loss_reason;
    }
    if (newStage === 'WON') {
      updates.won_date = new Date();
    }

    const [updated] = await db.update(schema.opportunities)
      .set(updates)
      .where(eq(schema.opportunities.id, id))
      .returning();

    // GAP-018: Insert conversation history entry on significant stage transitions
    if (newStage === 'WON' || newStage === 'LOST') {
      const summary = newStage === 'WON'
        ? `Opportunity "${opp.name}" (${opp.opportunity_code}) marked WON.`
        : `Opportunity "${opp.name}" (${opp.opportunity_code}) marked LOST. Reason: ${loss_reason ?? 'Not specified'}`;
      await db.insert(schema.conversationHistory).values({
        lead_id: opp.lead_id ?? null,
        prospect_id: opp.prospect_id ?? null,
        client_id: opp.client_id ?? null,
        interaction_type: 'NOTE',
        interaction_date: new Date(),
        summary,
        reference_type: 'opportunity',
        reference_id: id,
      } as any);
    }

    return updated;
  },

  async list(filters?: {
    stage?: string;
    product_type?: string;
    client_id?: string;
    lead_id?: number;
    prospect_id?: number;
    campaign_id?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: Opportunity[]; total: number; page: number; pageSize: number }> {
    const page = filters?.page || 1;
    const pageSize = Math.min(filters?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.stage) {
      conditions.push(eq(schema.opportunities.stage, filters.stage as any));
    }
    if (filters?.product_type) {
      conditions.push(eq(schema.opportunities.product_type, filters.product_type));
    }
    // AC-081: Extended filters
    if (filters?.client_id) {
      conditions.push(eq(schema.opportunities.client_id, filters.client_id));
    }
    if (filters?.lead_id) {
      conditions.push(eq(schema.opportunities.lead_id, filters.lead_id));
    }
    if (filters?.prospect_id) {
      conditions.push(eq(schema.opportunities.prospect_id, filters.prospect_id));
    }
    if (filters?.campaign_id) {
      conditions.push(eq(schema.opportunities.campaign_id, filters.campaign_id));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const opportunities = await db.select().from(schema.opportunities)
      .where(where)
      .orderBy(desc(schema.opportunities.created_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count: total }] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.opportunities)
      .where(where);

    return { data: opportunities, total, page, pageSize };
  },

  async getPipelineDashboard(): Promise<{
    by_stage: Array<{ stage: string | null; count: number; total_value: string; weighted_value: string }>;
    total_pipeline_value: number;
    weighted_pipeline_value: number;
  }> {
    const byStage = await db.select({
      stage: schema.opportunities.stage,
      count: sql<number>`count(*)`,
      total_value: sql<string>`coalesce(sum(pipeline_value::numeric), 0)`,
      weighted_value: sql<string>`coalesce(sum(pipeline_value::numeric * probability / 100.0), 0)`,
    }).from(schema.opportunities)
      .groupBy(schema.opportunities.stage);

    const totalPipeline = byStage.reduce((sum: number, s: any) => sum + parseFloat(s.total_value || '0'), 0);
    const weightedPipeline = byStage.reduce((sum: number, s: any) => sum + parseFloat(s.weighted_value || '0'), 0);

    return {
      by_stage: byStage,
      total_pipeline_value: totalPipeline,
      weighted_pipeline_value: weightedPipeline,
    };
  },

  async processExpiredOpportunities(today = new Date().toISOString().split('T')[0]): Promise<number> {
    const expiredOpportunities = await db
      .select()
      .from(schema.opportunities)
      .where(
        and(
          notInArray(schema.opportunities.stage, [...TERMINAL_STAGES]),
          eq(schema.opportunities.is_deleted, false),
          lt(schema.opportunities.expected_close_date, today),
        ),
      );

    for (const opp of expiredOpportunities) {
      await db.transaction(async (tx: typeof db) => {
        await tx
          .update(schema.opportunities)
          .set({
            stage: 'EXPIRED',
            updated_at: new Date(),
            updated_by: 'SYSTEM_EXPIRY_JOB',
          })
          .where(eq(schema.opportunities.id, opp.id));

        await tx.insert(schema.conversationHistory).values({
          lead_id: opp.lead_id ?? null,
          prospect_id: opp.prospect_id ?? null,
          client_id: opp.client_id ?? null,
          interaction_type: 'NOTE',
          interaction_date: new Date(),
          summary: `Opportunity "${opp.name}" (${opp.opportunity_code}) expired after expected close date ${opp.expected_close_date}.`,
          reference_type: 'opportunity',
          reference_id: opp.id,
          created_by: 'SYSTEM_EXPIRY_JOB',
        } as any);
      });
    }

    return expiredOpportunities.length;
  },
};
