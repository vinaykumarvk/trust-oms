/**
 * GL Batch Processor — Batch Posting + SOD/EOD Lifecycle
 *
 * Implements:
 *   POST-003: Batch posting mode (process multiple events with per-item error handling)
 *   SOD-001: Start-of-Day carry-forward (copy closing_balance → opening_balance)
 *   EOD-003: GL-specific EOD retry queue and dead-letter management
 *   EOD-005: Detailed EOD status with per-job breakdown
 *   BR-017: Batch posting accumulation and result summary
 *   EOD-004: EOD rollback (reverse all batches created during a run)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte, inArray, type InferSelectModel } from 'drizzle-orm';
import { glPostingEngine } from './gl-posting-engine';

type EodJob = InferSelectModel<typeof schema.eodJobs>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchEvent {
  sourceSystem: string;
  sourceReference: string;
  idempotencyKey: string;
  eventCode: string;
  payload: Record<string, unknown>;
  businessDate: string;
}

interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  duplicates: number;
  results: Array<{
    index: number;
    event_id: number | null;
    batch_id: number | null;
    batch_ref: string | null;
    status: string;
    errors: string[];
    duplicate: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glBatchProcessor = {
  // =========================================================================
  // POST-003, BR-017: Batch posting mode
  // =========================================================================

  async processBatch(
    events: BatchEvent[],
    autoAuthorizeUserId?: number,
  ): Promise<BatchResult> {
    const results: BatchResult['results'] = [];
    let succeeded = 0;
    let failed = 0;
    let duplicates = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        const pipelineResult = await glPostingEngine.processPostingPipeline({
          sourceSystem: event.sourceSystem,
          sourceReference: event.sourceReference,
          idempotencyKey: event.idempotencyKey,
          eventCode: event.eventCode,
          payload: event.payload,
          businessDate: event.businessDate,
          autoAuthorizeUserId,
        });

        if (pipelineResult.duplicate) {
          duplicates++;
        } else if (pipelineResult.posted) {
          succeeded++;
        } else {
          failed++;
        }

        results.push({
          index: i,
          event_id: pipelineResult.event_id,
          batch_id: pipelineResult.batch_id,
          batch_ref: pipelineResult.batch_ref,
          status: pipelineResult.batch_status,
          errors: pipelineResult.errors,
          duplicate: pipelineResult.duplicate,
        });
      } catch (err) {
        // Per-item error handling (settlement-service.ts pattern)
        failed++;
        results.push({
          index: i,
          event_id: null,
          batch_id: null,
          batch_ref: null,
          status: 'FAILED',
          errors: [(err as Error).message],
          duplicate: false,
        });
      }
    }

    return {
      total: events.length,
      succeeded,
      failed,
      duplicates,
      results,
    };
  },

  // =========================================================================
  // SOD-001: Start of Day — carry forward balances
  // =========================================================================

  async runStartOfDay(
    businessDate: string,
    userId: number,
  ): Promise<{
    business_date: string;
    balances_carried_forward: number;
    status: string;
  }> {
    // Get the prior business date's balances (most recent date < businessDate)
    const priorBalances = await db
      .select()
      .from(schema.glLedgerBalances)
      .where(
        sql`${schema.glLedgerBalances.balance_date} = (
          SELECT MAX(${schema.glLedgerBalances.balance_date})
          FROM ${schema.glLedgerBalances}
          WHERE ${schema.glLedgerBalances.balance_date} < ${businessDate}
        )`,
      );

    if (priorBalances.length === 0) {
      return {
        business_date: businessDate,
        balances_carried_forward: 0,
        status: 'NO_PRIOR_BALANCES',
      };
    }

    let carried = 0;

    for (const bal of priorBalances) {
      const closingBalance = toNum(bal.closing_balance);

      // Check if balance already exists for this date (idempotency)
      const [existing] = await db
        .select({ id: schema.glLedgerBalances.id })
        .from(schema.glLedgerBalances)
        .where(
          and(
            eq(schema.glLedgerBalances.gl_head_id, bal.gl_head_id),
            eq(schema.glLedgerBalances.accounting_unit_id, bal.accounting_unit_id),
            eq(schema.glLedgerBalances.currency, bal.currency),
            eq(schema.glLedgerBalances.balance_date, businessDate),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(schema.glLedgerBalances).values({
          gl_head_id: bal.gl_head_id,
          gl_access_code: bal.gl_access_code,
          accounting_unit_id: bal.accounting_unit_id,
          fund_id: bal.fund_id,
          portfolio_id: bal.portfolio_id,
          account_number: bal.account_number,
          contract_number: bal.contract_number,
          security_id: bal.security_id,
          counterparty_id: bal.counterparty_id,
          currency: bal.currency,
          accounting_standard: bal.accounting_standard,
          balance_date: businessDate,
          opening_balance: fmt(closingBalance),
          debit_turnover: '0.00',
          credit_turnover: '0.00',
          closing_balance: fmt(closingBalance),
        });
        carried++;
      }
    }

    // Write audit log
    await db.insert(schema.glAuditLog).values({
      action: 'SOD_RUN',
      object_type: 'LEDGER_BALANCE',
      object_id: 0,
      user_id: userId,
      new_values: {
        business_date: businessDate,
        balances_carried_forward: carried,
      } as Record<string, unknown>,
    });

    return {
      business_date: businessDate,
      balances_carried_forward: carried,
      status: 'COMPLETED',
    };
  },

  // =========================================================================
  // EOD-004: Rollback an EOD run (reverse all POSTED batches created during run)
  // =========================================================================

  async rollbackEodRun(
    runId: number,
    userId: number,
    reason: string,
  ): Promise<{
    run_id: number;
    batches_reversed: number;
    status: string;
    errors: string[];
  }> {
    const [run] = await db
      .select()
      .from(schema.eodRuns)
      .where(eq(schema.eodRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new Error(`EOD run not found: ${runId}`);
    }

    if (run.rollback_status === 'ROLLED_BACK') {
      throw new Error(`EOD run ${runId} has already been rolled back`);
    }

    // Find all POSTED batches that were created during this EOD run
    // (identified by posting_mode containing 'EOD' and transaction_date matching run_date)
    const runDate = run.run_date;
    const batchesToReverse = await db
      .select()
      .from(schema.glJournalBatches)
      .where(
        and(
          eq(schema.glJournalBatches.batch_status, 'POSTED'),
          eq(schema.glJournalBatches.transaction_date, runDate),
          sql`${schema.glJournalBatches.posting_mode} IN ('EOD', 'SOD', 'BATCH')`,
        ),
      );

    let reversed = 0;
    const errors: string[] = [];

    for (const batch of batchesToReverse) {
      try {
        await glPostingEngine.cancelJournalBatch(batch.id, `EOD rollback (run ${runId}): ${reason}`, userId);
        reversed++;
      } catch (err) {
        errors.push(`Batch ${batch.id} (${batch.batch_ref}): ${(err as Error).message}`);
      }
    }

    // Update run status
    await db
      .update(schema.eodRuns)
      .set({
        rollback_status: 'ROLLED_BACK',
        rolled_back_at: new Date(),
        rolled_back_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.eodRuns.id, runId));

    // Write audit log
    await db.insert(schema.glAuditLog).values({
      action: 'EOD_ROLLBACK',
      object_type: 'EOD_RUN',
      object_id: runId,
      user_id: userId,
      new_values: {
        batches_reversed: reversed,
        reason,
        errors: errors.length > 0 ? errors : undefined,
      } as Record<string, unknown>,
    });

    return {
      run_id: runId,
      batches_reversed: reversed,
      status: errors.length > 0 ? 'PARTIAL_ROLLBACK' : 'ROLLED_BACK',
      errors,
    };
  },

  // =========================================================================
  // EOD-005: Detailed EOD status with per-job breakdown
  // =========================================================================

  async getDetailedEodStatus(runId: number) {
    const [run] = await db
      .select()
      .from(schema.eodRuns)
      .where(eq(schema.eodRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new Error(`EOD run not found: ${runId}`);
    }

    const jobs = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.run_id, runId))
      .orderBy(schema.eodJobs.id);

    const summary = {
      total: jobs.length,
      pending: jobs.filter((j: EodJob) => j.job_status === 'PENDING').length,
      running: jobs.filter((j: EodJob) => j.job_status === 'RUNNING').length,
      completed: jobs.filter((j: EodJob) => j.job_status === 'COMPLETED').length,
      failed: jobs.filter((j: EodJob) => j.job_status === 'FAILED').length,
      skipped: jobs.filter((j: EodJob) => j.job_status === 'SKIPPED').length,
    };

    return {
      run,
      jobs: jobs.map((j: EodJob) => ({
        id: j.id,
        name: j.job_name,
        display_name: j.display_name,
        status: j.job_status,
        depends_on: j.depends_on,
        started_at: j.started_at,
        completed_at: j.completed_at,
        duration_ms: j.duration_ms,
        records_processed: j.records_processed,
        error_message: j.error_message,
        retry_count: (j as any).retry_count ?? 0,
        max_retries: (j as any).max_retries ?? 3,
      })),
      summary,
    };
  },

  // =========================================================================
  // EOD-003: GL job dead-letter queue — query permanently failed GL EOD jobs
  // =========================================================================

  /** Returns all GL posting exceptions raised by permanently failed EOD jobs. */
  async getGlJobDeadLetter(runId?: number) {
    const GL_JOB_NAMES = [
      'gl_accrual_reversal',
      'gl_interest_accrual',
      'gl_amortization',
      'gl_posting',
      'gl_balance_snapshot',
    ];

    // Posting exceptions created by EOD for GL jobs (retry_eligible=false = dead letter)
    const exceptions = await db
      .select()
      .from(schema.glPostingExceptions)
      .where(
        and(
          eq(schema.glPostingExceptions.source_system, 'EOD'),
          eq(schema.glPostingExceptions.retry_eligible, false),
          eq(schema.glPostingExceptions.resolved, false),
          eq(schema.glPostingExceptions.related_object_type, 'EOD_JOB'),
        ),
      )
      .orderBy(desc(schema.glPostingExceptions.id));

    // If runId provided, cross-reference against jobs in that run
    if (runId) {
      const runJobs = await db
        .select({ id: schema.eodJobs.id })
        .from(schema.eodJobs)
        .where(
          and(
            eq(schema.eodJobs.run_id, runId),
            inArray(schema.eodJobs.job_name, GL_JOB_NAMES),
          ),
        );
      const jobIds = new Set(runJobs.map((j: { id: number }) => j.id));
      return exceptions.filter(
        (e: { related_object_id: number | null }) =>
          e.related_object_id != null && jobIds.has(e.related_object_id),
      );
    }

    return exceptions;
  },

  // =========================================================================
  // EOD-003: Manual retry of a failed GL EOD job (resets to PENDING)
  // =========================================================================

  /**
   * Manually retry a permanently failed GL EOD job.
   * Resets retry_count to 0 and job_status to PENDING so the EOD DAG
   * will re-execute it on the next checkAndAdvance cycle.
   */
  async retryGlJobManually(
    jobId: number,
    userId: number,
  ): Promise<{ job_id: number; status: string }> {
    const [job] = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.id, jobId))
      .limit(1);

    if (!job) throw new Error(`EOD job not found: ${jobId}`);
    if (job.job_status !== 'FAILED') {
      throw new Error(`Job ${jobId} is not in FAILED status (current: ${job.job_status})`);
    }

    await db
      .update(schema.eodJobs)
      .set({
        job_status: 'PENDING',
        retry_count: 0,
        error_message: null,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        updated_at: new Date(),
      })
      .where(eq(schema.eodJobs.id, jobId));

    await db.insert(schema.glAuditLog).values({
      action: 'GL_JOB_MANUAL_RETRY',
      object_type: 'EOD_JOB',
      object_id: jobId,
      user_id: userId,
      new_values: { job_name: job.job_name, reset_to: 'PENDING' } as Record<string, unknown>,
    });

    return { job_id: jobId, status: 'PENDING' };
  },

  // =========================================================================
  // EOD-003: Resolve a dead-letter posting exception
  // =========================================================================

  async resolveGlPostingException(
    exceptionId: number,
    userId: number,
    resolution: string,
  ): Promise<{ exception_id: number; resolved: boolean }> {
    const [ex] = await db
      .select({ id: schema.glPostingExceptions.id, resolved: schema.glPostingExceptions.resolved })
      .from(schema.glPostingExceptions)
      .where(eq(schema.glPostingExceptions.id, exceptionId))
      .limit(1);

    if (!ex) throw new Error(`Posting exception not found: ${exceptionId}`);
    if (ex.resolved) throw new Error(`Exception ${exceptionId} is already resolved`);

    await db
      .update(schema.glPostingExceptions)
      .set({
        resolved: true,
        resolved_at: new Date(),
        resolved_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.glPostingExceptions.id, exceptionId));

    await db.insert(schema.glAuditLog).values({
      action: 'GL_EXCEPTION_RESOLVED',
      object_type: 'POSTING_EXCEPTION',
      object_id: exceptionId,
      user_id: userId,
      new_values: { resolution } as Record<string, unknown>,
    });

    return { exception_id: exceptionId, resolved: true };
  },

  // =========================================================================
  // SOD status check
  // =========================================================================

  async getSodStatus(businessDate: string) {
    const balances = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glLedgerBalances)
      .where(eq(schema.glLedgerBalances.balance_date, businessDate));

    const count = Number(balances[0]?.count ?? 0);

    // Check audit log for SOD run
    const [sodAudit] = await db
      .select()
      .from(schema.glAuditLog)
      .where(
        and(
          eq(schema.glAuditLog.action, 'SOD_RUN'),
          eq(schema.glAuditLog.object_type, 'LEDGER_BALANCE'),
        ),
      )
      .orderBy(desc(schema.glAuditLog.id))
      .limit(1);

    return {
      business_date: businessDate,
      balances_count: count,
      sod_completed: count > 0,
      last_sod_run: sodAudit?.timestamp ?? null,
    };
  },
};
