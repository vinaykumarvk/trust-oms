/**
 * Accrual Schedule Library Service (Phase 4 — TrustFees Pro)
 *
 * Manages accrual schedule definitions with full lifecycle:
 * DRAFT -> PENDING_APPROVAL -> ACTIVE -> RETIRED
 *
 * Enforces frequency ordering: DAILY < MONTHLY < QUARTERLY < SEMI_ANNUAL < ANNUAL
 * basis_frequency <= accrual_frequency
 * accounting_frequency between accrual and invoice frequencies
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';

/** Frequency ordering — lower index = more frequent */
const FREQ_ORDER: Record<string, number> = {
  DAILY: 0,
  MONTHLY: 1,
  QUARTERLY: 2,
  SEMI_ANNUAL: 3,
  ANNUAL: 4,
};

function freqRank(freq: string | null | undefined): number {
  return freq ? (FREQ_ORDER[freq] ?? -1) : -1;
}

/** Validate frequency ordering rules and toggle-dependent fields */
function validateSchedule(data: Record<string, unknown>) {
  const errors: string[] = [];

  // If accrual_enabled, accrual_frequency is required
  if (data.accrual_enabled && !data.accrual_frequency) {
    errors.push('accrual_frequency is required when accrual_enabled is true');
  }

  // If accounting_enabled, accounting_frequency is required
  if (data.accounting_enabled && !data.accounting_frequency) {
    errors.push('accounting_frequency is required when accounting_enabled is true');
  }

  // If reversal_enabled, reversal_age_days is required
  if (data.reversal_enabled && !data.reversal_age_days) {
    errors.push('reversal_age_days is required when reversal_enabled is true');
  }

  // basis_frequency must be <= accrual_frequency (more frequent or equal)
  if (data.basis_frequency && data.accrual_frequency) {
    if (freqRank(data.basis_frequency as string) > freqRank(data.accrual_frequency as string)) {
      errors.push('basis_frequency must be more frequent than or equal to accrual_frequency');
    }
  }

  // accounting_frequency must be between accrual and invoice frequencies
  if (data.accounting_enabled && data.accounting_frequency && data.accrual_frequency && data.invoice_frequency) {
    const acctRank = freqRank(data.accounting_frequency as string);
    const accrualRank = freqRank(data.accrual_frequency as string);
    const invoiceRank = freqRank(data.invoice_frequency as string);
    if (acctRank < accrualRank || acctRank > invoiceRank) {
      errors.push('accounting_frequency must be between accrual_frequency and invoice_frequency');
    }
  }

  // upfront_amortization only allowed when invoice_frequency = ANNUAL
  if (data.upfront_amortization && data.invoice_frequency !== 'ANNUAL') {
    errors.push('upfront_amortization is only allowed when invoice_frequency is ANNUAL');
  }

  return errors;
}

export const accrualScheduleService = {
  /** Create a new accrual schedule (starts as DRAFT) */
  async create(data: {
    schedule_code: string;
    schedule_name: string;
    accrual_enabled?: boolean;
    accrual_frequency?: string;
    accrual_method?: string;
    basis_frequency?: string;
    accounting_enabled?: boolean;
    accounting_frequency?: string;
    invoice_frequency?: string;
    due_date_offset_days?: number;
    reversal_enabled?: boolean;
    reversal_age_days?: number;
    recovery_mode?: string;
    recovery_frequency?: string;
    upfront_amortization?: boolean;
  }) {
    const validationErrors = validateSchedule(data);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
    }

    const [schedule] = await db
      .insert(schema.accrualSchedules)
      .values({
        schedule_code: data.schedule_code,
        schedule_name: data.schedule_name,
        accrual_enabled: data.accrual_enabled ?? true,
        accrual_frequency: data.accrual_frequency as any ?? null,
        accrual_method: data.accrual_method as any ?? 'ABSOLUTE',
        basis_frequency: data.basis_frequency as any ?? null,
        accounting_enabled: data.accounting_enabled ?? false,
        accounting_frequency: data.accounting_frequency as any ?? null,
        invoice_frequency: data.invoice_frequency as any ?? 'MONTHLY',
        due_date_offset_days: data.due_date_offset_days ?? 20,
        reversal_enabled: data.reversal_enabled ?? false,
        reversal_age_days: data.reversal_age_days ?? null,
        recovery_mode: data.recovery_mode ?? 'USER',
        recovery_frequency: data.recovery_frequency as any ?? null,
        upfront_amortization: data.upfront_amortization ?? false,
        library_status: 'DRAFT',
      })
      .returning();

    return schedule;
  },

  /** Update an existing accrual schedule (only if DRAFT or REJECTED -> reverted to DRAFT) */
  async update(id: number, data: Record<string, unknown>) {
    const [existing] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    if (existing.library_status !== 'DRAFT') {
      throw new Error(`Cannot update schedule in ${existing.library_status} status — must be DRAFT`);
    }

    // Merge existing values with updates for validation
    const merged = { ...existing, ...data };
    const validationErrors = validateSchedule(merged);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
    }

    const [updated] = await db
      .update(schema.accrualSchedules)
      .set({
        ...(data.schedule_name !== undefined && { schedule_name: data.schedule_name as string }),
        ...(data.accrual_enabled !== undefined && { accrual_enabled: data.accrual_enabled as boolean }),
        ...(data.accrual_frequency !== undefined && { accrual_frequency: data.accrual_frequency as any }),
        ...(data.accrual_method !== undefined && { accrual_method: data.accrual_method as any }),
        ...(data.basis_frequency !== undefined && { basis_frequency: data.basis_frequency as any }),
        ...(data.accounting_enabled !== undefined && { accounting_enabled: data.accounting_enabled as boolean }),
        ...(data.accounting_frequency !== undefined && { accounting_frequency: data.accounting_frequency as any }),
        ...(data.invoice_frequency !== undefined && { invoice_frequency: data.invoice_frequency as any }),
        ...(data.due_date_offset_days !== undefined && { due_date_offset_days: data.due_date_offset_days as number }),
        ...(data.reversal_enabled !== undefined && { reversal_enabled: data.reversal_enabled as boolean }),
        ...(data.reversal_age_days !== undefined && { reversal_age_days: data.reversal_age_days as number }),
        ...(data.recovery_mode !== undefined && { recovery_mode: data.recovery_mode as string }),
        ...(data.recovery_frequency !== undefined && { recovery_frequency: data.recovery_frequency as any }),
        ...(data.upfront_amortization !== undefined && { upfront_amortization: data.upfront_amortization as boolean }),
        updated_at: new Date(),
      })
      .where(eq(schema.accrualSchedules.id, id))
      .returning();

    return updated;
  },

  /** List all accrual schedules with optional filters and pagination */
  async getAll(filters: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.accrualSchedules.library_status, filters.status as any));
    }

    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.accrualSchedules.schedule_code, `%${filters.search}%`),
          ilike(schema.accrualSchedules.schedule_name, `%${filters.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.accrualSchedules)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.accrualSchedules.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.accrualSchedules)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get a single accrual schedule by ID */
  async getById(id: number) {
    const [schedule] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!schedule) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    return schedule;
  },

  /** Submit a DRAFT schedule for approval */
  async submit(id: number) {
    const [existing] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    if (existing.library_status !== 'DRAFT') {
      throw new Error(`Cannot submit schedule in ${existing.library_status} status — must be DRAFT`);
    }

    // Validate before submission
    const validationErrors = validateSchedule(existing);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join('; ')}`);
    }

    const [updated] = await db
      .update(schema.accrualSchedules)
      .set({
        library_status: 'PENDING_APPROVAL',
        updated_at: new Date(),
      })
      .where(eq(schema.accrualSchedules.id, id))
      .returning();

    return updated;
  },

  /** Approve a PENDING_APPROVAL schedule (SoD — Separation of Duties) */
  async approve(id: number) {
    const [existing] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    if (existing.library_status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot approve schedule in ${existing.library_status} status — must be PENDING_APPROVAL`);
    }

    const [updated] = await db
      .update(schema.accrualSchedules)
      .set({
        library_status: 'ACTIVE',
        updated_at: new Date(),
      })
      .where(eq(schema.accrualSchedules.id, id))
      .returning();

    return updated;
  },

  /** Reject a PENDING_APPROVAL schedule back to DRAFT */
  async reject(id: number) {
    const [existing] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    if (existing.library_status !== 'PENDING_APPROVAL') {
      throw new Error(`Cannot reject schedule in ${existing.library_status} status — must be PENDING_APPROVAL`);
    }

    const [updated] = await db
      .update(schema.accrualSchedules)
      .set({
        library_status: 'DRAFT',
        updated_at: new Date(),
      })
      .where(eq(schema.accrualSchedules.id, id))
      .returning();

    return updated;
  },

  /** Retire an ACTIVE schedule — blocked if ACTIVE feePlans reference it */
  async retire(id: number) {
    const [existing] = await db
      .select()
      .from(schema.accrualSchedules)
      .where(eq(schema.accrualSchedules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Accrual schedule not found: ${id}`);
    }

    if (existing.library_status !== 'ACTIVE') {
      throw new Error(`Cannot retire schedule in ${existing.library_status} status — must be ACTIVE`);
    }

    // Check for active fee plans referencing this schedule
    const activeFeePlans = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.accrual_schedule_id, id),
          eq(schema.feePlans.plan_status, 'ACTIVE' as any),
        ),
      );

    const activePlanCount = Number(activeFeePlans[0]?.count ?? 0);
    if (activePlanCount > 0) {
      throw new Error(
        `Cannot retire schedule — ${activePlanCount} active fee plan(s) reference it. Retire or reassign those plans first.`,
      );
    }

    const [updated] = await db
      .update(schema.accrualSchedules)
      .set({
        library_status: 'RETIRED',
        updated_at: new Date(),
      })
      .where(eq(schema.accrualSchedules.id, id))
      .returning();

    return updated;
  },
};
