/**
 * Fee Plan Template Library Service (Phase 4 — TrustFees Pro)
 *
 * Manages reusable fee plan templates. Each template stores a
 * default_payload (JSONB) containing pre-filled FeePlan fields.
 * Templates can be activated/deactivated and filtered by category.
 *
 * The instantiate() method returns a plain object with pre-filled
 * FeePlan fields derived from the template's default_payload.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';

export const feePlanTemplateService = {
  /** Create a new fee plan template */
  async create(data: {
    template_code: string;
    template_name: string;
    category: string;
    default_payload: Record<string, unknown>;
    jurisdiction_id?: number;
    is_active?: boolean;
  }) {
    if (!data.template_code || !data.template_name || !data.category) {
      throw new Error('template_code, template_name, and category are required');
    }

    const [template] = await db
      .insert(schema.feePlanTemplates)
      .values({
        template_code: data.template_code,
        template_name: data.template_name,
        category: data.category,
        default_payload: data.default_payload,
        jurisdiction_id: data.jurisdiction_id ?? null,
        is_active: data.is_active ?? true,
      })
      .returning();

    return template;
  },

  /** Update an existing fee plan template */
  async update(id: number, data: Record<string, unknown>) {
    const [existing] = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(eq(schema.feePlanTemplates.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Fee plan template not found: ${id}`);
    }

    const [updated] = await db
      .update(schema.feePlanTemplates)
      .set({
        ...(data.template_name !== undefined && { template_name: data.template_name as string }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.default_payload !== undefined && { default_payload: data.default_payload as Record<string, unknown> }),
        ...(data.jurisdiction_id !== undefined && { jurisdiction_id: data.jurisdiction_id as number }),
        ...(data.is_active !== undefined && { is_active: data.is_active as boolean }),
        updated_at: new Date(),
      })
      .where(eq(schema.feePlanTemplates.id, id))
      .returning();

    return updated;
  },

  /** List all fee plan templates with optional filters and pagination */
  async getAll(filters: {
    category?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.category) {
      conditions.push(eq(schema.feePlanTemplates.category, filters.category as any));
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.feePlanTemplates.template_code, `%${filters.search}%`),
          ilike(schema.feePlanTemplates.template_name, `%${filters.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.feePlanTemplates.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feePlanTemplates)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get a single fee plan template by ID */
  async getById(id: number) {
    const [template] = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(eq(schema.feePlanTemplates.id, id))
      .limit(1);

    if (!template) {
      throw new Error(`Fee plan template not found: ${id}`);
    }

    return template;
  },

  /** Toggle the is_active flag on a template */
  async toggleActive(id: number) {
    const [existing] = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(eq(schema.feePlanTemplates.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Fee plan template not found: ${id}`);
    }

    const [updated] = await db
      .update(schema.feePlanTemplates)
      .set({
        is_active: !existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(schema.feePlanTemplates.id, id))
      .returning();

    return updated;
  },

  /** Get templates filtered by category */
  async getByCategory(category: string) {
    const data = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(eq(schema.feePlanTemplates.category, category as any))
      .orderBy(desc(schema.feePlanTemplates.created_at));

    return data;
  },

  /** Instantiate a template — returns pre-filled FeePlan fields from default_payload */
  async instantiate(templateId: number) {
    const [template] = await db
      .select()
      .from(schema.feePlanTemplates)
      .where(eq(schema.feePlanTemplates.id, templateId))
      .limit(1);

    if (!template) {
      throw new Error(`Fee plan template not found: ${templateId}`);
    }

    if (!template.is_active) {
      throw new Error(`Cannot instantiate inactive template: ${template.template_code}`);
    }

    const payload = template.default_payload as Record<string, unknown>;

    return {
      template_id: template.id,
      template_code: template.template_code,
      template_name: template.template_name,
      category: template.category,
      jurisdiction_id: template.jurisdiction_id,
      // Spread the default_payload fields as pre-filled FeePlan data
      ...payload,
    };
  },
};
