/**
 * Pricing Definition Service (TrustFees Pro — Phase 2)
 *
 * Manages the Pricing Definition library with full lifecycle:
 *   DRAFT → PENDING_APPROVAL → ACTIVE → RETIRED
 *
 * Supports pricing types: FIXED_AMOUNT, FIXED_RATE,
 * SLAB_CUMULATIVE_AMOUNT, SLAB_CUMULATIVE_RATE,
 * SLAB_INCREMENTAL_AMOUNT, SLAB_INCREMENTAL_RATE, STEP_FUNCTION.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export const pricingDefinitionService = {
  /** Create a new pricing definition (starts as DRAFT v1) */
  async create(data: {
    pricing_code: string;
    pricing_name: string;
    pricing_type: (typeof schema.pricingTypeEnum.enumValues)[number];
    currency?: string;
    pricing_tiers?: unknown[];
    step_windows?: unknown[];
    created_by?: string;
  }) {
    const [record] = await db
      .insert(schema.pricingDefinitions)
      .values({
        pricing_code: data.pricing_code,
        pricing_name: data.pricing_name,
        pricing_type: data.pricing_type,
        currency: data.currency ?? 'PHP',
        pricing_tiers: (data.pricing_tiers ?? []) as unknown as Record<string, unknown>,
        step_windows: data.step_windows
          ? (data.step_windows as unknown as Record<string, unknown>)
          : null,
        pricing_version: 1,
        library_status: 'DRAFT',
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** Update an existing pricing definition (increments version, keeps code) */
  async update(
    id: number,
    data: {
      pricing_name?: string;
      pricing_type?: (typeof schema.pricingTypeEnum.enumValues)[number];
      currency?: string;
      pricing_tiers?: unknown[];
      step_windows?: unknown[];
      updated_by?: string;
    },
  ) {
    // Fetch current record to increment version
    const [current] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    if (current.library_status !== 'DRAFT') {
      throw new Error(
        `Cannot edit pricing definition in ${current.library_status} status. Only DRAFT records can be edited.`,
      );
    }

    const setValues: Record<string, unknown> = {
      pricing_version: current.pricing_version + 1,
      updated_at: new Date(),
      updated_by: data.updated_by ?? null,
    };

    if (data.pricing_name !== undefined) setValues.pricing_name = data.pricing_name;
    if (data.pricing_type !== undefined) setValues.pricing_type = data.pricing_type;
    if (data.currency !== undefined) setValues.currency = data.currency;
    if (data.pricing_tiers !== undefined)
      setValues.pricing_tiers = data.pricing_tiers as unknown as Record<string, unknown>;
    if (data.step_windows !== undefined)
      setValues.step_windows = data.step_windows
        ? (data.step_windows as unknown as Record<string, unknown>)
        : null;

    const [updated] = await db
      .update(schema.pricingDefinitions)
      .set(setValues)
      .where(eq(schema.pricingDefinitions.id, id))
      .returning();

    return updated;
  },

  /** List pricing definitions with optional filters and pagination */
  async getAll(filters?: {
    status?: string;
    pricing_type?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.status) {
      conditions.push(
        eq(schema.pricingDefinitions.library_status, filters.status as any),
      );
    }

    if (filters?.pricing_type) {
      conditions.push(
        eq(schema.pricingDefinitions.pricing_type, filters.pricing_type as any),
      );
    }

    if (filters?.search) {
      conditions.push(
        sql`(${schema.pricingDefinitions.pricing_code} ILIKE ${'%' + filters.search + '%'} OR ${schema.pricingDefinitions.pricing_name} ILIKE ${'%' + filters.search + '%'})`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.pricingDefinitions.updated_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.pricingDefinitions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get a single pricing definition by ID */
  async getById(id: number) {
    const [record] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    return record;
  },

  /** Submit a DRAFT pricing definition for approval → PENDING_APPROVAL */
  async submit(id: number) {
    const [current] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    if (current.library_status !== 'DRAFT') {
      throw new Error(
        `Cannot submit: pricing definition is in ${current.library_status} status. Only DRAFT records can be submitted.`,
      );
    }

    const [updated] = await db
      .update(schema.pricingDefinitions)
      .set({
        library_status: 'PENDING_APPROVAL',
        updated_at: new Date(),
      })
      .where(eq(schema.pricingDefinitions.id, id))
      .returning();

    return updated;
  },

  /** Approve a PENDING_APPROVAL pricing definition → ACTIVE */
  async approve(id: number, approverId: string) {
    const [current] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    if (current.library_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve: pricing definition is in ${current.library_status} status. Only PENDING_APPROVAL records can be approved.`,
      );
    }

    // Segregation of Duties: approver must not be the creator
    if (current.created_by && approverId === current.created_by) {
      throw new Error(
        'Segregation of Duties violation: approver cannot be the same person who created the record.',
      );
    }

    const [updated] = await db
      .update(schema.pricingDefinitions)
      .set({
        library_status: 'ACTIVE',
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.pricingDefinitions.id, id))
      .returning();

    return updated;
  },

  /** Reject a PENDING_APPROVAL pricing definition → DRAFT */
  async reject(id: number, approverId: string, comment: string) {
    const [current] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    if (current.library_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot reject: pricing definition is in ${current.library_status} status. Only PENDING_APPROVAL records can be rejected.`,
      );
    }

    const [updated] = await db
      .update(schema.pricingDefinitions)
      .set({
        library_status: 'DRAFT',
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.pricingDefinitions.id, id))
      .returning();

    return { ...updated, rejection_comment: comment };
  },

  /** Retire an ACTIVE pricing definition → RETIRED (blocked if referenced by active fee plans) */
  async retire(id: number) {
    const [current] = await db
      .select()
      .from(schema.pricingDefinitions)
      .where(eq(schema.pricingDefinitions.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Pricing definition not found: ${id}`);
    }

    if (current.library_status !== 'ACTIVE') {
      throw new Error(
        `Cannot retire: pricing definition is in ${current.library_status} status. Only ACTIVE records can be retired.`,
      );
    }

    // Block retirement if any ACTIVE FeePlan references this definition
    const activePlans = await db
      .select({ id: schema.feePlans.id, fee_plan_code: schema.feePlans.fee_plan_code })
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.pricing_definition_id, id),
          eq(schema.feePlans.plan_status, 'ACTIVE'),
        ),
      );

    if (activePlans.length > 0) {
      const planCodes = activePlans.map((p: { id: number; fee_plan_code: string }) => p.fee_plan_code).join(', ');
      throw new Error(
        `Cannot retire: ${activePlans.length} active fee plan(s) reference this pricing definition (${planCodes}). Suspend or expire those plans first.`,
      );
    }

    const [updated] = await db
      .update(schema.pricingDefinitions)
      .set({
        library_status: 'RETIRED',
        updated_at: new Date(),
      })
      .where(eq(schema.pricingDefinitions.id, id))
      .returning();

    return updated;
  },
};
