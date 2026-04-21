/**
 * EOD Orchestrator Service (Phase 3B)
 *
 * DAG-based End-of-Day job chain. Each job declares its dependencies;
 * when all prerequisites complete, the dependent job fires automatically.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, type InferSelectModel } from 'drizzle-orm';
import { tfpAccrualEngine } from './tfp-accrual-engine';
import { tfpInvoiceService } from './tfp-invoice-service';
import { tfpReversalService } from './tfp-reversal-service';
import { feeEngineService } from './fee-engine-service';
import { corporateActionsService } from './corporate-actions-service';
import { taxEngineService } from './tax-engine-service';
import { reconciliationService } from './reconciliation-service';
import { ttraService } from './ttra-service';
import { settlementService } from './settlement-service';
import { exceptionQueueService } from './exception-queue-service';

type EodJob = InferSelectModel<typeof schema.eodJobs>;

// ---------------------------------------------------------------------------
// Job definitions with dependency graph
// ---------------------------------------------------------------------------

const JOB_DEFINITIONS = [
  { name: 'ttra_expiry_check', displayName: 'TTRA Expiry Check & Fallback', dependsOn: [] as string[] },
  { name: 'ttra_reminders', displayName: 'TTRA Expiry Reminders', dependsOn: ['ttra_expiry_check'] },
  { name: 'nav_ingestion', displayName: 'NAV Ingestion', dependsOn: [] as string[] },
  { name: 'nav_validation', displayName: 'NAV Validation', dependsOn: ['nav_ingestion'] },
  { name: 'portfolio_revaluation', displayName: 'Portfolio Revaluation', dependsOn: ['nav_validation'] },
  { name: 'position_snapshot', displayName: 'Position Snapshot', dependsOn: ['portfolio_revaluation'] },
  { name: 'settlement_processing', displayName: 'Settlement Processing', dependsOn: ['position_snapshot'] },
  { name: 'fee_accrual', displayName: 'Fee Accrual', dependsOn: ['settlement_processing'] },
  { name: 'commission_accrual', displayName: 'Commission Accrual', dependsOn: ['settlement_processing'] },
  { name: 'ca_entitlement_calc', displayName: 'CA Entitlement Calculation', dependsOn: ['position_snapshot'] },
  { name: 'ca_tax_calc', displayName: 'CA WHT Tax Calculation', dependsOn: ['ca_entitlement_calc'] },
  { name: 'ca_settlement', displayName: 'CA Settlement Posting', dependsOn: ['ca_tax_calc'] },
  { name: 'ca_recon_triad', displayName: 'Internal Triad Reconciliation', dependsOn: ['ca_settlement', 'fee_accrual'] },
  { name: 'invoice_generation', displayName: 'Invoice Generation', dependsOn: ['fee_accrual'] },
  { name: 'notional_accounting', displayName: 'Notional Accounting', dependsOn: ['invoice_generation'] },
  { name: 'reversal_check', displayName: 'Reversal Check', dependsOn: ['notional_accounting'] },
  { name: 'data_quality_check', displayName: 'Data Quality Check', dependsOn: ['fee_accrual', 'commission_accrual'] },
  { name: 'exception_sweep', displayName: 'Exception Sweep', dependsOn: ['reversal_check', 'data_quality_check'] },
  { name: 'regulatory_report_gen', displayName: 'Regulatory Reports', dependsOn: ['exception_sweep'] },
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
  // Execute a single job -- dispatches to real service or stub
  // -------------------------------------------------------------------------
  async executeJob(jobId: number) {
    const [job] = await db
      .select()
      .from(schema.eodJobs)
      .where(eq(schema.eodJobs.id, jobId))
      .limit(1);

    if (!job || !job.run_id) return;

    // Resolve run_date for this EOD run
    const [run] = await db
      .select({ run_date: schema.eodRuns.run_date })
      .from(schema.eodRuns)
      .where(eq(schema.eodRuns.id, job.run_id))
      .limit(1);
    const runDate = run?.run_date ?? new Date().toISOString().split('T')[0];

    const startTime = Date.now();

    try {
      let recordsProcessed = 0;

      // Dispatch to real service methods based on job name
      switch (job.job_name) {
        // ----- TTRA jobs (Phase 9) -----
        case 'ttra_expiry_check': {
          console.log(`[EOD] TTRA expiry check & fallback for ${runDate}`);
          const expiryResult = await ttraService.processExpiryFallback();
          recordsProcessed = expiryResult.expiredCount;
          break;
        }

        case 'ttra_reminders': {
          console.log(`[EOD] TTRA expiry reminders for ${runDate}`);
          const reminderResult = await ttraService.sendExpiryReminders();
          recordsProcessed = reminderResult.remindersSent;
          break;
        }

        // ----- Fee accrual (real service) -----
        case 'fee_accrual': {
          console.log(`[EOD] Fee accrual for ${runDate}`);
          // TFP accrual engine (primary)
          const tfpResult = await tfpAccrualEngine.runDailyAccrual(runDate);
          // Fee engine service (supplementary schedules)
          const feeResult = await feeEngineService.runDailyAccrual(runDate);
          recordsProcessed = (tfpResult.created + tfpResult.exceptions) + feeResult.schedulesProcessed;
          break;
        }

        // ----- Settlement processing (real service) -----
        case 'settlement_processing': {
          console.log(`[EOD] Settlement processing for ${runDate}`);
          // settlementService does not have a processSettlements() method;
          // use bulkSettle to process pending settlements for the run date
          const settleResult = await settlementService.bulkSettle({ valueDate: runDate });
          recordsProcessed = settleResult.settled_count + settleResult.failed_count;
          break;
        }

        // ----- CA jobs (Phase 9) -----
        case 'ca_entitlement_calc': {
          console.log(`[EOD] CA entitlement calculation for ${runDate}`);
          // Query corporate actions with GOLDEN_COPY status and ex_date = runDate
          const goldenCAs = await db
            .select()
            .from(schema.corporateActions)
            .where(
              and(
                eq(schema.corporateActions.ca_status, 'GOLDEN_COPY'),
                eq(schema.corporateActions.ex_date, runDate),
              ),
            );

          let entitlementsCreated = 0;
          for (const ca of goldenCAs) {
            // Find all portfolios with positions in this security
            const positionsForCA = await db
              .select({ portfolio_id: schema.positions.portfolio_id })
              .from(schema.positions)
              .where(eq(schema.positions.security_id, ca.security_id!));

            // De-duplicate portfolio IDs
            const uniquePortfolios = [
              ...new Set(positionsForCA.map((p: { portfolio_id: string | null }) => p.portfolio_id).filter(Boolean)),
            ] as string[];

            for (const portfolioId of uniquePortfolios) {
              try {
                await corporateActionsService.calculateEntitlement(ca.id, portfolioId);
                entitlementsCreated++;
              } catch (entErr: unknown) {
                console.error(
                  `[EOD] CA entitlement calc error CA=${ca.id} portfolio=${portfolioId}:`,
                  entErr instanceof Error ? entErr.message : entErr,
                );
                // Continue processing remaining CA/portfolio pairs
              }
            }
          }
          recordsProcessed = entitlementsCreated;
          break;
        }

        case 'ca_tax_calc': {
          console.log(`[EOD] CA WHT tax calculation for ${runDate}`);
          // Query new untaxed entitlements: posted=false AND tax_treatment is null
          const untaxedEntitlements = await db
            .select()
            .from(schema.corporateActionEntitlements)
            .where(
              and(
                eq(schema.corporateActionEntitlements.posted, false),
                sql`${schema.corporateActionEntitlements.tax_treatment} IS NULL`,
              ),
            );

          let taxCalcCount = 0;
          for (const ent of untaxedEntitlements) {
            try {
              await taxEngineService.calculateCAWHT(ent.id);
              taxCalcCount++;
            } catch (taxErr: unknown) {
              console.error(
                `[EOD] CA WHT calc error entitlement=${ent.id}:`,
                taxErr instanceof Error ? taxErr.message : taxErr,
              );
            }
          }
          recordsProcessed = taxCalcCount;
          break;
        }

        case 'ca_settlement': {
          console.log(`[EOD] CA settlement posting for ${runDate}`);
          // Query entitlements with elected_option set and not yet posted
          const electableEntitlements = await db
            .select()
            .from(schema.corporateActionEntitlements)
            .where(
              and(
                eq(schema.corporateActionEntitlements.posted, false),
                sql`${schema.corporateActionEntitlements.elected_option} IS NOT NULL`,
              ),
            );

          let postedCount = 0;
          for (const ent of electableEntitlements) {
            try {
              await corporateActionsService.postCaAdjustment(ent.id);
              postedCount++;
            } catch (postErr: unknown) {
              console.error(
                `[EOD] CA settlement post error entitlement=${ent.id}:`,
                postErr instanceof Error ? postErr.message : postErr,
              );
            }
          }
          recordsProcessed = postedCount;
          break;
        }

        case 'ca_recon_triad': {
          console.log(`[EOD] Internal triad reconciliation for ${runDate}`);
          const reconResult = await reconciliationService.runInternalTriadRecon(runDate);
          recordsProcessed = reconResult.breaks_created;
          break;
        }

        // ----- Existing stub jobs -----
        case 'nav_ingestion': {
          console.log(`[EOD] NAV ingestion stub for ${runDate}`);
          const delay = 800 + Math.floor(Math.random() * 1200);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 20 + Math.floor(Math.random() * 80);
          break;
        }

        case 'nav_validation': {
          console.log(`[EOD] NAV validation stub for ${runDate}`);
          const delay = 500 + Math.floor(Math.random() * 1000);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 20 + Math.floor(Math.random() * 80);
          break;
        }

        case 'portfolio_revaluation': {
          console.log(`[EOD] Portfolio revaluation stub for ${runDate}`);
          const delay = 1000 + Math.floor(Math.random() * 1500);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 15 + Math.floor(Math.random() * 50);
          break;
        }

        case 'position_snapshot': {
          console.log(`[EOD] Position snapshot stub for ${runDate}`);
          const delay = 800 + Math.floor(Math.random() * 1200);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 50 + Math.floor(Math.random() * 200);
          break;
        }

        case 'commission_accrual': {
          console.log(`[EOD] Commission accrual stub for ${runDate}`);
          const delay = 500 + Math.floor(Math.random() * 1000);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 10 + Math.floor(Math.random() * 40);
          break;
        }

        case 'invoice_generation': {
          console.log(`[EOD] Invoice generation for ${runDate}`);
          // Generate invoices from month start to run date
          const monthStartForInvoice = runDate.substring(0, 7) + '-01';
          const invoiceResult = await tfpInvoiceService.generateInvoices(monthStartForInvoice, runDate);
          // Also batch-mark overdue invoices
          const overdueResult = await tfpInvoiceService.markOverdue();
          recordsProcessed = invoiceResult.invoices_created + overdueResult.marked_overdue;
          break;
        }

        case 'notional_accounting': {
          console.log(`[EOD] Notional accounting stub for ${runDate}`);
          const delay = 500 + Math.floor(Math.random() * 1000);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = Math.floor(Math.random() * 30);
          break;
        }

        case 'reversal_check': {
          console.log(`[EOD] Reversal check for ${runDate}`);
          const reversalResult = await tfpReversalService.checkReversals(runDate);
          recordsProcessed = reversalResult.reversals_processed + reversalResult.invoices_cancelled;
          break;
        }

        case 'data_quality_check': {
          console.log(`[EOD] Data quality check stub for ${runDate}`);
          const delay = 600 + Math.floor(Math.random() * 900);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 30 + Math.floor(Math.random() * 70);
          break;
        }

        case 'exception_sweep': {
          console.log(`[EOD] Exception sweep (SLA breach check) for ${runDate}`);
          const slaResult = await exceptionQueueService.checkSlaBreaches();
          recordsProcessed = slaResult.breaches_found;
          break;
        }

        case 'regulatory_report_gen': {
          console.log(`[EOD] Regulatory report generation stub for ${runDate}`);
          const delay = 700 + Math.floor(Math.random() * 1300);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 5 + Math.floor(Math.random() * 15);
          break;
        }

        case 'daily_report': {
          console.log(`[EOD] Daily report stub for ${runDate}`);
          const delay = 500 + Math.floor(Math.random() * 800);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 1 + Math.floor(Math.random() * 5);
          break;
        }

        default: {
          // Default stub: simulate processing with a 1-3 second delay
          console.log(`[EOD] Unknown job ${job.job_name} stub for ${runDate}`);
          const delay = 1000 + Math.floor(Math.random() * 2000);
          await new Promise((resolve: (value: unknown) => void) => setTimeout(resolve, delay));
          recordsProcessed = 10 + Math.floor(Math.random() * 490);
          break;
        }
      }

      const durationMs = Date.now() - startTime;

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
