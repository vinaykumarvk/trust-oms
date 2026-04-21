/**
 * Eligibility Expression Service (TrustFees Pro — Phase 3)
 *
 * Standard CRUD + approval lifecycle (DRAFT → PENDING_APPROVAL → ACTIVE → RETIRED)
 * with separation-of-duties checks for approve/reject.
 *
 * Methods: create, update, getAll, getById, submit, approve, reject, retire, testExpression
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { eligibilityEngine, type ASTNode } from './eligibility-engine';

export const eligibilityExpressionService = {
  /** Create a new eligibility expression (starts as DRAFT) */
  async create(data: {
    eligibilityCode: string;
    eligibilityName: string;
    expression: ASTNode;
    createdBy?: string;
  }) {
    // Validate the expression AST
    const validation = eligibilityEngine.validate(data.expression);
    if (!validation.valid) {
      throw new Error(`Invalid expression: ${validation.errors.join('; ')}`);
    }

    const [record] = await db
      .insert(schema.eligibilityExpressions)
      .values({
        eligibility_code: data.eligibilityCode,
        eligibility_name: data.eligibilityName,
        expression: data.expression as unknown as Record<string, unknown>,
        library_status: 'DRAFT',
        created_by: data.createdBy ?? null,
        updated_by: data.createdBy ?? null,
      })
      .returning();

    return record;
  },

  /** Update an existing DRAFT expression */
  async update(
    id: number,
    data: {
      eligibilityName?: string;
      expression?: ASTNode;
      updatedBy?: string;
    },
  ) {
    // Verify the record exists and is DRAFT
    const [existing] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(eq(schema.eligibilityExpressions.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    if (existing.library_status !== 'DRAFT') {
      throw new Error(
        `Only DRAFT expressions can be updated. Current status: ${existing.library_status}`,
      );
    }

    // If expression is provided, validate it
    if (data.expression) {
      const validation = eligibilityEngine.validate(data.expression);
      if (!validation.valid) {
        throw new Error(`Invalid expression: ${validation.errors.join('; ')}`);
      }
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date(),
      updated_by: data.updatedBy ?? null,
    };
    if (data.eligibilityName !== undefined) {
      updatePayload.eligibility_name = data.eligibilityName;
    }
    if (data.expression !== undefined) {
      updatePayload.expression = data.expression as unknown as Record<string, unknown>;
    }

    const [updated] = await db
      .update(schema.eligibilityExpressions)
      .set(updatePayload)
      .where(eq(schema.eligibilityExpressions.id, id))
      .returning();

    return updated;
  },

  /** List all eligibility expressions with optional filters and pagination */
  async getAll(filters: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.eligibilityExpressions.is_deleted, false),
    ];

    if (filters.status) {
      conditions.push(
        eq(schema.eligibilityExpressions.library_status, filters.status as any),
      );
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.eligibilityExpressions.eligibility_code, `%${filters.search}%`),
          ilike(schema.eligibilityExpressions.eligibility_name, `%${filters.search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const data = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.eligibilityExpressions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.eligibilityExpressions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get a single eligibility expression by ID */
  async getById(id: number) {
    const [record] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(
        and(
          eq(schema.eligibilityExpressions.id, id),
          eq(schema.eligibilityExpressions.is_deleted, false),
        ),
      )
      .limit(1);

    if (!record) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    return record;
  },

  /** Submit a DRAFT expression for approval */
  async submit(id: number, submittedBy?: string) {
    const [existing] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(eq(schema.eligibilityExpressions.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    if (existing.library_status !== 'DRAFT') {
      throw new Error(
        `Only DRAFT expressions can be submitted. Current status: ${existing.library_status}`,
      );
    }

    const [updated] = await db
      .update(schema.eligibilityExpressions)
      .set({
        library_status: 'PENDING_APPROVAL',
        updated_at: new Date(),
        updated_by: submittedBy ?? null,
      })
      .where(eq(schema.eligibilityExpressions.id, id))
      .returning();

    return updated;
  },

  /** Approve a PENDING_APPROVAL expression (separation of duties: approver must differ from submitter) */
  async approve(id: number, approvedBy?: string) {
    const [existing] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(eq(schema.eligibilityExpressions.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    if (existing.library_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Only PENDING_APPROVAL expressions can be approved. Current status: ${existing.library_status}`,
      );
    }

    // Separation of Duties check
    if (approvedBy && existing.updated_by && approvedBy === existing.updated_by) {
      throw new Error(
        'Separation of Duties: approver must be different from the submitter',
      );
    }

    const [updated] = await db
      .update(schema.eligibilityExpressions)
      .set({
        library_status: 'ACTIVE',
        updated_at: new Date(),
        updated_by: approvedBy ?? null,
      })
      .where(eq(schema.eligibilityExpressions.id, id))
      .returning();

    return updated;
  },

  /** Reject a PENDING_APPROVAL expression (returns to DRAFT) */
  async reject(id: number, rejectedBy?: string) {
    const [existing] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(eq(schema.eligibilityExpressions.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    if (existing.library_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Only PENDING_APPROVAL expressions can be rejected. Current status: ${existing.library_status}`,
      );
    }

    const [updated] = await db
      .update(schema.eligibilityExpressions)
      .set({
        library_status: 'DRAFT',
        updated_at: new Date(),
        updated_by: rejectedBy ?? null,
      })
      .where(eq(schema.eligibilityExpressions.id, id))
      .returning();

    return updated;
  },

  /** Retire an ACTIVE expression (blocked if referenced by any ACTIVE fee plans) */
  async retire(id: number, retiredBy?: string) {
    const [existing] = await db
      .select()
      .from(schema.eligibilityExpressions)
      .where(eq(schema.eligibilityExpressions.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Eligibility expression not found: ${id}`);
    }

    if (existing.library_status !== 'ACTIVE') {
      throw new Error(
        `Only ACTIVE expressions can be retired. Current status: ${existing.library_status}`,
      );
    }

    // Check for references in active fee plans
    const activeRefs = await db
      .select({ id: schema.feePlans.id, fee_plan_code: schema.feePlans.fee_plan_code })
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.eligibility_expression_id, id),
          eq(schema.feePlans.plan_status, 'ACTIVE'),
        ),
      );

    if (activeRefs.length > 0) {
      const refCodes = activeRefs.map((r: { id: number; fee_plan_code: string }) => r.fee_plan_code).join(', ');
      throw new Error(
        `Cannot retire: expression is referenced by ${activeRefs.length} ACTIVE fee plan(s): ${refCodes}`,
      );
    }

    const [updated] = await db
      .update(schema.eligibilityExpressions)
      .set({
        library_status: 'RETIRED',
        updated_at: new Date(),
        updated_by: retiredBy ?? null,
      })
      .where(eq(schema.eligibilityExpressions.id, id))
      .returning();

    return updated;
  },

  /** Test an expression against a sample context — returns evaluation result + trace */
  async testExpression(id: number, sampleContext: Record<string, any>) {
    const record = await eligibilityExpressionService.getById(id);
    const expression = record.expression as unknown as ASTNode;

    // Validate structure first
    const validation = eligibilityEngine.validate(expression);
    if (!validation.valid) {
      return {
        expressionId: id,
        valid: false,
        errors: validation.errors,
        result: false,
        trace: [],
      };
    }

    const evalResult = eligibilityEngine.evaluate(expression, sampleContext);

    return {
      expressionId: id,
      valid: true,
      errors: [],
      result: evalResult.result,
      trace: evalResult.trace,
    };
  },
};
