/**
 * Standing Instructions Service (Phase 3I)
 *
 * IMA/TA Standing Instructions management.
 * Handles creation, modification, deactivation, pre-termination,
 * and due instruction queries (BDO RFI Gap #9 Critical).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, lte } from 'drizzle-orm';

export const standingInstructionsService = {
  /** Create a new standing instruction */
  async createInstruction(data: {
    accountId?: string;
    portfolioId: string;
    type: 'AUTO_ROLL' | 'AUTO_CREDIT' | 'AUTO_WITHDRAWAL';
    params: Record<string, unknown>;
  }) {
    const [instruction] = await db
      .insert(schema.standingInstructions)
      .values({
        account_id: data.accountId ?? null,
        portfolio_id: data.portfolioId,
        instruction_type: data.type,
        params: data.params,
        is_active: true,
      })
      .returning();

    return instruction;
  },

  /** Modify an existing standing instruction */
  async modifyInstruction(
    id: number,
    data: {
      params?: Record<string, unknown>;
      nextExecutionDate?: string;
    },
  ) {
    const [instruction] = await db
      .select()
      .from(schema.standingInstructions)
      .where(eq(schema.standingInstructions.id, id))
      .limit(1);

    if (!instruction) {
      throw new Error(`Standing instruction not found: ${id}`);
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (data.params !== undefined) {
      updates.params = data.params;
    }

    if (data.nextExecutionDate !== undefined) {
      updates.next_execution_date = data.nextExecutionDate;
    }

    const [updated] = await db
      .update(schema.standingInstructions)
      .set(updates)
      .where(eq(schema.standingInstructions.id, id))
      .returning();

    return updated;
  },

  /** Deactivate a standing instruction */
  async deactivateInstruction(id: number) {
    const [instruction] = await db
      .select()
      .from(schema.standingInstructions)
      .where(eq(schema.standingInstructions.id, id))
      .limit(1);

    if (!instruction) {
      throw new Error(`Standing instruction not found: ${id}`);
    }

    const [updated] = await db
      .update(schema.standingInstructions)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(schema.standingInstructions.id, id))
      .returning();

    return updated;
  },

  /** Process pre-termination for an account (stub) */
  async processPreTermination(accountId: string) {
    // Stub: compute proceeds
    console.log(`[StandingInstructions] Pre-termination processed for account ${accountId}`);

    return {
      accountId,
      proceeds: 0,
      status: 'PROCESSED' as const,
    };
  },

  /** List standing instructions with filters and pagination */
  async getInstructions(filters: {
    portfolioId?: string;
    type?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(eq(schema.standingInstructions.portfolio_id, filters.portfolioId));
    }

    if (filters.type) {
      conditions.push(eq(schema.standingInstructions.instruction_type, filters.type as any));
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.standingInstructions.is_active, filters.isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.standingInstructions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.standingInstructions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.standingInstructions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get standing instructions that are due for execution */
  async getDueInstructions(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const data = await db
      .select()
      .from(schema.standingInstructions)
      .where(
        and(
          eq(schema.standingInstructions.is_active, true),
          lte(schema.standingInstructions.next_execution_date, targetDate),
        ),
      )
      .orderBy(schema.standingInstructions.next_execution_date);

    return { data, asOfDate: targetDate };
  },
};
