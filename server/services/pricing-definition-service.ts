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

/** G-002: Validate that slab pricing tiers are non-overlapping, contiguous, and each from < to */
function validateSlabTiers(tiers: Array<{ from?: number; to?: number }>, label = 'tiers'): void {
  const sorted = [...tiers].sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    const from = tier.from ?? 0;
    const to = tier.to;
    if (to !== undefined && to !== null && from >= to) {
      throw new Error(`Pricing ${label} tier ${i + 1}: from (${from}) must be less than to (${to})`);
    }
    if (i > 0) {
      const prevTo = sorted[i - 1].to;
      if (prevTo !== undefined && prevTo !== null && from !== prevTo) {
        throw new Error(`Pricing ${label} tier ${i + 1}: gap or overlap detected (prev to=${prevTo}, curr from=${from})`);
      }
    }
  }
}

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
    // G-002: Validate slab tier from < to and contiguity
    if (data.pricing_type?.startsWith('SLAB_') && data.pricing_tiers && data.pricing_tiers.length > 0) {
      validateSlabTiers(data.pricing_tiers as Array<{ from?: number; to?: number }>);
    }

    // GAP-A22: Validate STEP_FUNCTION window contiguity
    if (data.pricing_type === 'STEP_FUNCTION' && data.step_windows && data.step_windows.length > 1) {
      const windows = data.step_windows as Array<{ from_month?: number; to_month?: number }>;
      const sorted = [...windows].sort((a, b) => (a.from_month ?? 0) - (b.from_month ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prevTo = sorted[i - 1].to_month ?? 0;
        const currFrom = sorted[i].from_month ?? 0;
        if (currFrom !== prevTo) {
          throw new Error(
            `Step function windows are not contiguous: gap between to_month=${prevTo} and from_month=${currFrom} at window ${i + 1}`,
          );
        }
      }
    }

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

    // G-002: Validate slab tier from < to and contiguity on update
    const effectiveTiers = data.pricing_tiers ?? (current.pricing_tiers as unknown[] | null);
    const effectivePricingType = data.pricing_type ?? current.pricing_type;
    if (effectivePricingType?.startsWith('SLAB_') && effectiveTiers && Array.isArray(effectiveTiers) && effectiveTiers.length > 0) {
      validateSlabTiers(effectiveTiers as Array<{ from?: number; to?: number }>);
    }

    // GAP-A22: Validate STEP_FUNCTION window contiguity on update
    const effectiveType = data.pricing_type ?? current.pricing_type;
    const effectiveWindows = data.step_windows ?? (current.step_windows as unknown[] | null);
    if (effectiveType === 'STEP_FUNCTION' && effectiveWindows && Array.isArray(effectiveWindows) && effectiveWindows.length > 1) {
      const windows = effectiveWindows as Array<{ from_month?: number; to_month?: number }>;
      const sorted = [...windows].sort((a, b) => (a.from_month ?? 0) - (b.from_month ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const prevTo = sorted[i - 1].to_month ?? 0;
        const currFrom = sorted[i].from_month ?? 0;
        if (currFrom !== prevTo) {
          throw new Error(
            `Step function windows are not contiguous: gap between to_month=${prevTo} and from_month=${currFrom} at window ${i + 1}`,
          );
        }
      }
    }

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
