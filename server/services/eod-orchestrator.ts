/**
 * EOD Orchestrator Service (Phase 3B)
 *
 * DAG-based End-of-Day job chain. Each job declares its dependencies;
 * when all prerequisites complete, the dependent job fires automatically.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';

type EodJob = InferSelectModel<typeof schema.eodJobs>;

// ---------------------------------------------------------------------------
// Job definitions with dependency graph
// ---------------------------------------------------------------------------

const JOB_DEFINITIONS = [
  { name: 'nav_ingestion', displayName: 'NAV Ingestion', dependsOn: [] as string[] },
  { name: 'nav_validation', displayName: 'NAV Validation', dependsOn: ['nav_ingestion'] },
  { name: 'portfolio_revaluation', displayName: 'Portfolio Revaluation', dependsOn: ['nav_validation'] },
  { name: 'position_snapshot', displayName: 'Position Snapshot', dependsOn: ['portfolio_revaluation'] },
  { name: 'settlement_processing', displayName: 'Settlement Processing', dependsOn: ['position_snapshot'] },
  { name: 'fee_accrual', displayName: 'Fee Accrual', dependsOn: ['settlement_processing'] },
  { name: 'commission_accrual', displayName: 'Commission Accrual', dependsOn: ['settlement_processing'] },
  { name: 'data_quality_check', displayName: 'Data Quality Check', dependsOn: ['fee_accrual', 'commission_accrual'] },
  { name: 'regulatory_report_gen', displayName: 'Regulatory Reports', dependsOn: ['data_quality_check'] },
  { name: 'daily_report', displayName: 'Daily Report', dependsOn: ['regulatory_report_gen'] },
];

export const eodOrchestrator = {
  // -------------------------------------------------------------------------
  // Trigger a new EOD run for a given date
  // -------------------------------------------------------------------------
  async triggerRun(runDate: string, triggeredBy: number) {
    // Create the EOD run record
    const [run] = await db
      .insert(schema.eodRuns)
      .values({
        run_date: runDate,
        run_status: 'RUNNING',
        started_at: new Date(),
        total_jobs: JOB_DEFINITIONS.length,
        completed_jobs: 0,
        failed_jobs: 0,
        triggered_by: triggeredBy,
      })
      .returning();

    // Create a job record for each definition
    for (const def of JOB_DEFINITIONS) {
      await db.insert(schema.eodJobs).values({
        run_id: run.id,
        job_name: def.name,
        display_name: def.displayName,
        job_status: 'PENDING',
        depends_on: def.dependsOn.length > 0 ? def.dependsOn : null,
      });
    }

    // Kick off jobs with no dependencies
    await this.checkAndAdvance(run.id);

    // Re-fetch the run with jobs
    return this.getRunStatus(run.id);
  },

  // -------------------------------------------------------------------------
  // Get status of current/latest EOD run
  // -------------------------------------------------------------------------
  async getRunStatus(runId?: number) {
    let run;

    if (runId) {
      [run] = await db
        .select()
        .from(schema.eodRuns)
        .where(eq(schema.eodRuns.id, runId))
        .limit(1);
    } else {
      [run] = await db
        .select()
        .from(schema.eodRuns)
        .orderBy(desc(schema.eodRuns.id))
        .limit(1);
    }

    if (!run) return null;

    const jobs = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.run_id, run.id));

    return { ...run, jobs };
  },

  // -------------------------------------------------------------------------
  // Check and advance: fire dependent jobs when prerequisites complete
  // -------------------------------------------------------------------------
  async checkAndAdvance(runId: number) {
    const jobs = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.run_id, runId));

    const statusMap = new Map(jobs.map((j: EodJob) => [j.job_name, j.job_status]));

    let advanced = false;

    for (const job of jobs) {
      if (job.job_status !== 'PENDING') continue;

      // Check if all dependencies are COMPLETED or SKIPPED
      const deps = job.depends_on ?? [];
      const allDepsResolved = deps.every((dep: string) => {
        const depStatus = statusMap.get(dep);
        return depStatus === 'COMPLETED' || depStatus === 'SKIPPED';
      });

      if (allDepsResolved) {
        // Fire this job
        await db
          .update(schema.eodJobs)
          .set({ job_status: 'RUNNING', started_at: new Date() })
          .where(eq(schema.eodJobs.id, job.id));

        advanced = true;

        // Execute asynchronously (don't await -- let it run in background)
        this.executeJob(job.id).catch(() => {
          // Error handling is inside executeJob
        });
      }
    }

    // Check if all jobs are finished (COMPLETED, FAILED, or SKIPPED)
    if (!advanced) {
      const refreshedJobs = await db
        .select()
        .from(schema.eodJobs)
        .where(eq(schema.eodJobs.run_id, runId));

      const allDone = refreshedJobs.every(
        (j: EodJob) => j.job_status === 'COMPLETED' || j.job_status === 'FAILED' || j.job_status === 'SKIPPED',
      );

      if (allDone) {
        const completedCount = refreshedJobs.filter((j: EodJob) => j.job_status === 'COMPLETED').length;
        const failedCount = refreshedJobs.filter((j: EodJob) => j.job_status === 'FAILED').length;
        const runStatus = failedCount > 0 ? 'FAILED' : 'COMPLETED';

        await db
          .update(schema.eodRuns)
          .set({
            run_status: runStatus as 'COMPLETED' | 'FAILED',
            completed_at: new Date(),
            completed_jobs: completedCount,
            failed_jobs: failedCount,
          })
          .where(eq(schema.eodRuns.id, runId));
      }
    }
  },

  // -------------------------------------------------------------------------
  // Execute a single job (stub -- simulates work with delay)
  // -------------------------------------------------------------------------
  async executeJob(jobId: number) {
    const [job] = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.id, jobId))
      .limit(1);

    if (!job || !job.run_id) return;

    const startTime = Date.now();

    try {
      // Simulate processing with a 1-3 second delay
      const delay = 1000 + Math.floor(Math.random() * 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      const durationMs = Date.now() - startTime;
      const recordsProcessed = 10 + Math.floor(Math.random() * 490);

      await db
        .update(schema.eodJobs)
        .set({
          job_status: 'COMPLETED',
          completed_at: new Date(),
          duration_ms: durationMs,
          records_processed: recordsProcessed,
        })
        .where(eq(schema.eodJobs.id, jobId));

      // Update parent run's completed_jobs count
      await db
        .update(schema.eodRuns)
        .set({
          completed_jobs: sql`${schema.eodRuns.completed_jobs} + 1`,
        })
        .where(eq(schema.eodRuns.id, job.run_id));

      // Advance the DAG
      await this.checkAndAdvance(job.run_id);
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      await db
        .update(schema.eodJobs)
        .set({
          job_status: 'FAILED',
          completed_at: new Date(),
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .where(eq(schema.eodJobs.id, jobId));

      // Update parent run's failed_jobs count
      await db
        .update(schema.eodRuns)
        .set({
          failed_jobs: sql`${schema.eodRuns.failed_jobs} + 1`,
        })
        .where(eq(schema.eodRuns.id, job.run_id));

      // Still try to advance (other paths may proceed)
      await this.checkAndAdvance(job.run_id);
    }
  },

  // -------------------------------------------------------------------------
  // Retry a failed job
  // -------------------------------------------------------------------------
  async retryJob(jobId: number) {
    const [job] = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.id, jobId))
      .limit(1);

    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.job_status !== 'FAILED') {
      throw new Error(`Cannot retry job in status ${job.job_status}; must be FAILED`);
    }

    // Reset job state
    await db
      .update(schema.eodJobs)
      .set({
        job_status: 'PENDING',
        error_message: null,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        records_processed: 0,
      })
      .where(eq(schema.eodJobs.id, jobId));

    // Decrement failed_jobs on the run
    if (job.run_id) {
      await db
        .update(schema.eodRuns)
        .set({
          run_status: 'RUNNING',
          failed_jobs: sql`GREATEST(${schema.eodRuns.failed_jobs} - 1, 0)`,
          completed_at: null,
        })
        .where(eq(schema.eodRuns.id, job.run_id));

      await this.checkAndAdvance(job.run_id);
    }

    return this.getRunStatus(job.run_id ?? undefined);
  },

  // -------------------------------------------------------------------------
  // Skip a stuck job to unblock dependents
  // -------------------------------------------------------------------------
  async skipJob(jobId: number) {
    const [job] = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.id, jobId))
      .limit(1);

    if (!job) throw new Error(`Job not found: ${jobId}`);

    await db
      .update(schema.eodJobs)
      .set({
        job_status: 'SKIPPED',
        completed_at: new Date(),
      })
      .where(eq(schema.eodJobs.id, jobId));

    if (job.run_id) {
      await this.checkAndAdvance(job.run_id);
    }

    return this.getRunStatus(job.run_id ?? undefined);
  },

  // -------------------------------------------------------------------------
  // Get EOD run history
  // -------------------------------------------------------------------------
  async getHistory(params?: { page?: number; pageSize?: number }) {
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const data = await db
      .select()
      .from(schema.eodRuns)
      .orderBy(desc(schema.eodRuns.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.eodRuns);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Get job definitions (static DAG)
  // -------------------------------------------------------------------------
  getDefinitions() {
    return JOB_DEFINITIONS;
  },
};
