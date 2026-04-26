/**
 * GL Report Scheduler — Automated Report Execution
 *
 * Implements:
 *   REP-008: Schedule report definitions for automated execution
 *   Integrates with EOD job chain for daily/periodic report generation
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import { glReportBuilder } from './gl-report-builder';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const glReportScheduler = {
  // =========================================================================
  // Schedule CRUD
  // =========================================================================

  async scheduleReport(data: {
    reportDefinitionId: number;
    scheduleName: string;
    frequency: string;
    nextRunDate?: string;
    outputFormat?: string;
    recipients?: Array<{ email: string; name: string }>;
    userId?: number;
  }) {
    const [record] = await db
      .insert(schema.glReportSchedules)
      .values({
        report_definition_id: data.reportDefinitionId,
        schedule_name: data.scheduleName,
        frequency: data.frequency,
        next_run_date: data.nextRunDate ?? new Date().toISOString().split('T')[0],
        output_format: data.outputFormat ?? 'JSON',
        recipients: data.recipients ?? null,
        is_active: true,
        owner_user_id: data.userId ?? null,
      })
      .returning();
    return record;
  },

  async getSchedules() {
    return db
      .select()
      .from(schema.glReportSchedules)
      .where(eq(schema.glReportSchedules.is_active, true))
      .orderBy(schema.glReportSchedules.id);
  },

  async updateSchedule(id: number, data: Record<string, unknown>) {
    const [updated] = await db
      .update(schema.glReportSchedules)
      .set({ ...data, updated_at: new Date() })
      .where(eq(schema.glReportSchedules.id, id))
      .returning();
    return updated;
  },

  // =========================================================================
  // Execute scheduled reports (called from EOD or cron)
  // =========================================================================

  async executeScheduledReports(businessDate: string): Promise<{
    executed: number;
    failed: number;
    results: Array<{ schedule_id: number; report_name: string; status: string; error?: string }>;
  }> {
    // Find all active schedules due for execution
    const dueSchedules = await db
      .select()
      .from(schema.glReportSchedules)
      .where(
        and(
          eq(schema.glReportSchedules.is_active, true),
          lte(schema.glReportSchedules.next_run_date, businessDate),
        ),
      );

    let executed = 0;
    let failed = 0;
    const results: Array<{ schedule_id: number; report_name: string; status: string; error?: string }> = [];

    for (const schedule of dueSchedules) {
      try {
        // Execute the report
        await glReportBuilder.executeReport(schedule.report_definition_id, {
          dateTo: businessDate,
        });

        // Calculate next run date based on frequency
        const nextDate = this.calculateNextRunDate(businessDate, schedule.frequency);

        // Update schedule
        await db
          .update(schema.glReportSchedules)
          .set({
            last_run_date: businessDate,
            last_run_status: 'COMPLETED',
            next_run_date: nextDate,
            updated_at: new Date(),
          })
          .where(eq(schema.glReportSchedules.id, schedule.id));

        executed++;
        results.push({
          schedule_id: schedule.id,
          report_name: schedule.schedule_name,
          status: 'COMPLETED',
        });
      } catch (err) {
        failed++;

        await db
          .update(schema.glReportSchedules)
          .set({
            last_run_date: businessDate,
            last_run_status: 'FAILED',
            updated_at: new Date(),
          })
          .where(eq(schema.glReportSchedules.id, schedule.id));

        results.push({
          schedule_id: schedule.id,
          report_name: schedule.schedule_name,
          status: 'FAILED',
          error: (err as Error).message,
        });
      }
    }

    return { executed, failed, results };
  },

  // =========================================================================
  // Helper: Calculate next run date
  // =========================================================================

  calculateNextRunDate(currentDate: string, frequency: string): string {
    const date = new Date(currentDate);

    switch (frequency) {
      case 'DAILY':
        date.setDate(date.getDate() + 1);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() + 7);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'QUARTERLY':
        date.setMonth(date.getMonth() + 3);
        break;
      default:
        date.setDate(date.getDate() + 1);
    }

    return date.toISOString().split('T')[0];
  },
};
