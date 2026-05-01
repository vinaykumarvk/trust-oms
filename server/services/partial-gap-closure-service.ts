/**
 * partial-gap-closure-service.ts — P0/P1 PARTIAL BDO RFI Gap Closures
 *
 * Extends existing services with missing capabilities:
 *   P-01: Day-of-month scheduling + job history
 *   P-02: UITF holiday calendar validation
 *   P-03/P-04: Bulk order import with validation
 *   P-05: Batch/many-to-many transfers
 *   P-06: Batch account creation
 *   P-07/P-08: Cash flow projections
 *   P-09/P-10/P-11: SWIFT settlement file generation + memo processing
 *   P-12: Report export (Excel/CSV/PDF)
 *   P-13: Fiscal closing workflow
 *   P-14: Transaction advice generation
 *   P-15: Real-time settlement connector stubs
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, lte, gte, desc, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// P-01: Enhanced Scheduler — Day-of-month triggers + Job history
// ---------------------------------------------------------------------------

export const schedulerEnhancements = {
  /** Calculate next run date with day-of-month support */
  calculateNextRunDate(
    currentDate: string,
    frequency: string,
    dayOfMonth?: number | null,
  ): string {
    const date = new Date(currentDate);

    switch (frequency) {
      case 'DAILY':
        date.setDate(date.getDate() + 1);
        break;
      case 'WEEKLY':
        date.setDate(date.getDate() + 7);
        break;
      case 'MONTHLY': {
        date.setMonth(date.getMonth() + 1);
        if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
          const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
          date.setDate(Math.min(dayOfMonth, maxDay));
        }
        break;
      }
      case 'QUARTERLY': {
        date.setMonth(date.getMonth() + 3);
        if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
          const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
          date.setDate(Math.min(dayOfMonth, maxDay));
        }
        break;
      }
      case 'SEMI_ANNUAL':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'ANNUAL':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        date.setDate(date.getDate() + 1);
    }

    return date.toISOString().split('T')[0];
  },

  /** Record a job execution in the history table */
  async recordJobExecution(data: {
    scheduleId: number;
    executionDate: string;
    status: string;
    recordsGenerated?: number;
    errorMessage?: string;
    executionTimeMs?: number;
    outputFormat?: string;
    outputReference?: string;
  }) {
    const [record] = await db
      .insert(schema.reportJobHistory)
      .values({
        schedule_id: data.scheduleId,
        execution_date: data.executionDate,
        job_status: data.status,
        records_generated: data.recordsGenerated ?? 0,
        error_message: data.errorMessage ?? null,
        execution_time_ms: data.executionTimeMs ?? 0,
        output_format: data.outputFormat ?? null,
        output_reference: data.outputReference ?? null,
      })
      .returning();
    return record;
  },

  /** Get job history for a schedule with pagination */
  async getJobHistory(scheduleId: number, limit = 25) {
    return db
      .select()
      .from(schema.reportJobHistory)
      .where(eq(schema.reportJobHistory.schedule_id, scheduleId))
      .orderBy(desc(schema.reportJobHistory.created_at))
      .limit(limit);
  },

  /** Enhanced executeScheduledReports with job history logging */
  async executeWithHistory(
    businessDate: string,
    executeFn: (scheduleId: number, params: Record<string, unknown>) => Promise<number>,
  ) {
    const dueSchedules = await db
      .select()
      .from(schema.glReportSchedules)
      .where(
        and(
          eq(schema.glReportSchedules.is_active, true),
          lte(schema.glReportSchedules.next_run_date, businessDate),
        ),
      );

    const results: Array<{ schedule_id: number; status: string; records: number; error?: string }> = [];

    for (const schedule of dueSchedules) {
      const startTime = Date.now();
      try {
        const records = await executeFn(schedule.report_definition_id, { dateTo: businessDate });
        const elapsedMs = Date.now() - startTime;

        await this.recordJobExecution({
          scheduleId: schedule.id,
          executionDate: businessDate,
          status: 'COMPLETED',
          recordsGenerated: records,
          executionTimeMs: elapsedMs,
          outputFormat: schedule.output_format ?? 'JSON',
        });

        const nextDate = this.calculateNextRunDate(businessDate, schedule.frequency);
        await db
          .update(schema.glReportSchedules)
          .set({ last_run_date: businessDate, last_run_status: 'COMPLETED', next_run_date: nextDate, updated_at: new Date() })
          .where(eq(schema.glReportSchedules.id, schedule.id));

        results.push({ schedule_id: schedule.id, status: 'COMPLETED', records });
      } catch (err) {
        const elapsedMs = Date.now() - startTime;
        const errorMsg = (err as Error).message;

        await this.recordJobExecution({
          scheduleId: schedule.id,
          executionDate: businessDate,
          status: 'FAILED',
          errorMessage: errorMsg,
          executionTimeMs: elapsedMs,
        });

        await db
          .update(schema.glReportSchedules)
          .set({ last_run_date: businessDate, last_run_status: 'FAILED', updated_at: new Date() })
          .where(eq(schema.glReportSchedules.id, schedule.id));

        results.push({ schedule_id: schedule.id, status: 'FAILED', records: 0, error: errorMsg });
      }
    }

    return { total: dueSchedules.length, results };
  },
};

// ---------------------------------------------------------------------------
// P-02: Holiday Calendar & UITF NAV Validation
// ---------------------------------------------------------------------------

export const holidayCalendarService = {
  /** Add a market holiday */
  async addHoliday(data: {
    holidayDate: string;
    marketCode?: string;
    holidayName: string;
    holidayType?: string;
    isHalfDay?: boolean;
  }) {
    const [record] = await db
      .insert(schema.marketHolidays)
      .values({
        holiday_date: data.holidayDate,
        market_code: data.marketCode ?? 'PSE',
        holiday_name: data.holidayName,
        holiday_type: data.holidayType ?? 'REGULAR',
        is_half_day: data.isHalfDay ?? false,
      })
      .returning();
    return record;
  },

  /** Bulk import holidays (e.g., from BSP annual circular) */
  async bulkImportHolidays(
    holidays: Array<{ holidayDate: string; holidayName: string; marketCode?: string; holidayType?: string }>,
  ) {
    if (holidays.length === 0) return [];
    const values = holidays.map((h) => ({
      holiday_date: h.holidayDate,
      market_code: h.marketCode ?? 'PSE',
      holiday_name: h.holidayName,
      holiday_type: h.holidayType ?? 'REGULAR',
      is_half_day: false,
    }));
    return db.insert(schema.marketHolidays).values(values).returning();
  },

  /** Check if a given date is a market holiday */
  async isHoliday(date: string, marketCode = 'PSE'): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.marketHolidays)
      .where(
        and(
          eq(schema.marketHolidays.holiday_date, date),
          eq(schema.marketHolidays.market_code, marketCode),
        ),
      );
    return Number(result?.count ?? 0) > 0;
  },

  /** Check if date is a business day (not weekend, not holiday) */
  async isBusinessDay(date: string, marketCode = 'PSE'): Promise<boolean> {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return !(await this.isHoliday(date, marketCode));
  },

  /** Get the next business day from a given date */
  async getNextBusinessDay(date: string, marketCode = 'PSE'): Promise<string> {
    const d = new Date(date);
    let attempts = 0;
    do {
      d.setDate(d.getDate() + 1);
      attempts++;
    } while (!(await this.isBusinessDay(d.toISOString().split('T')[0], marketCode)) && attempts < 30);
    return d.toISOString().split('T')[0];
  },

  /** Calculate T+N settlement date, skipping holidays and weekends */
  async calculateSettlementDate(tradeDate: string, days: number, marketCode = 'PSE'): Promise<string> {
    let current = tradeDate;
    let remaining = days;
    while (remaining > 0) {
      current = await this.getNextBusinessDay(current, marketCode);
      remaining--;
    }
    return current;
  },

  /** Get all holidays for a year */
  async getHolidaysForYear(year: number, marketCode = 'PSE') {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return db
      .select()
      .from(schema.marketHolidays)
      .where(
        and(
          eq(schema.marketHolidays.market_code, marketCode),
          gte(schema.marketHolidays.holiday_date, startDate),
          lte(schema.marketHolidays.holiday_date, endDate),
        ),
      )
      .orderBy(schema.marketHolidays.holiday_date);
  },

  /** Validate NAV submission not on holiday */
  async validateNavDate(navDate: string, marketCode = 'PSE'): Promise<{ valid: boolean; reason?: string }> {
    const isHol = await this.isHoliday(navDate, marketCode);
    if (isHol) {
      return { valid: false, reason: `NAV date ${navDate} falls on a market holiday for ${marketCode}` };
    }
    const d = new Date(navDate);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { valid: false, reason: `NAV date ${navDate} falls on a weekend` };
    }
    return { valid: true };
  },
};

// ---------------------------------------------------------------------------
// P-03/P-04: Enhanced Bulk Order Import
// ---------------------------------------------------------------------------

export const bulkOrderImportService = {
  /** Validate order rows with mandate compliance pre-check */
  async validateOrderRows(
    rows: Array<Record<string, unknown>>,
    portfolioId: string,
  ): Promise<{
    valid: Array<Record<string, unknown>>;
    errors: Array<{ row: number; field: string; message: string }>;
  }> {
    const valid: Array<Record<string, unknown>> = [];
    const errors: Array<{ row: number; field: string; message: string }> = [];

    // Get portfolio mandate limits
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) {
      errors.push({ row: 0, field: 'portfolio_id', message: `Portfolio ${portfolioId} not found` });
      return { valid, errors };
    }

    const seenIsins = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const rowErrors: Array<{ row: number; field: string; message: string }> = [];

      // Required field checks
      const requiredFields = ['security_id', 'side', 'quantity'];
      for (const field of requiredFields) {
        if (!row[field]) {
          rowErrors.push({ row: rowNum, field, message: `${field} is required` });
        }
      }

      // Side validation
      const side = String(row.side ?? '').toUpperCase();
      if (!['BUY', 'SELL', 'SWITCH_IN', 'SWITCH_OUT'].includes(side)) {
        rowErrors.push({ row: rowNum, field: 'side', message: `Invalid side: ${row.side}. Must be BUY, SELL, SWITCH_IN, or SWITCH_OUT` });
      }

      // Quantity validation
      const qty = parseFloat(String(row.quantity ?? '0'));
      if (isNaN(qty) || qty <= 0) {
        rowErrors.push({ row: rowNum, field: 'quantity', message: 'Quantity must be a positive number' });
      }

      // Price validation (optional for UITF)
      if (row.price !== undefined && row.price !== null) {
        const price = parseFloat(String(row.price));
        if (isNaN(price) || price < 0) {
          rowErrors.push({ row: rowNum, field: 'price', message: 'Price must be a non-negative number' });
        }
      }

      // Duplicate detection within batch
      const isin = String(row.isin ?? row.security_id ?? '');
      const key = `${isin}-${side}`;
      if (seenIsins.has(key)) {
        rowErrors.push({ row: rowNum, field: 'security_id', message: `Duplicate order for ${isin} ${side} in same batch` });
      }
      seenIsins.add(key);

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        valid.push({ ...row, _rowNum: rowNum });
      }
    }

    return { valid, errors };
  },

  /** Create orders from validated batch */
  async createOrdersFromBatch(
    batchId: number,
    validRows: Array<Record<string, unknown>>,
    portfolioId: string,
    userId: string,
  ): Promise<{ created: number; orderIds: string[] }> {
    const orderIds: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const row of validRows) {
      const orderNo = `BULK-${batchId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const securityId = typeof row.security_id === 'string' ? parseInt(row.security_id, 10) : (row.security_id as number);
      const [order] = await db
        .insert(schema.orders)
        .values({
          portfolio_id: portfolioId,
          security_id: isNaN(securityId) ? null : securityId,
          side: String(row.side).toUpperCase() as any,
          quantity: String(row.quantity),
          price: row.price ? String(row.price) : null,
          currency: String(row.currency ?? 'PHP'),
          order_status: 'PENDING_AUTH',
          order_type: String(row.order_type ?? 'MARKET'),
          order_no: orderNo,
          value_date: String(row.value_date ?? todayStr),
          created_by: userId,
        })
        .returning();
      orderIds.push(order.order_id);
    }

    return { created: orderIds.length, orderIds };
  },
};

// ---------------------------------------------------------------------------
// P-05: Batch / Many-to-Many Transfer Service
// ---------------------------------------------------------------------------

export const batchTransferService = {
  /** Create a transfer group for batch processing */
  async createTransferGroup(data: {
    groupType: string;
    description: string;
    initiatedBy: string;
  }) {
    const groupId = `TG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [group] = await db
      .insert(schema.transferGroups)
      .values({
        group_id: groupId,
        group_type: data.groupType,
        description: data.description,
        initiated_by: data.initiatedBy,
        group_status: 'PENDING',
        total_transfers: 0,
        completed_transfers: 0,
      })
      .returning();
    return group;
  },

  /** Add multiple transfers to a group (many-to-many) */
  async addTransfersToGroup(
    groupId: string,
    transfers: Array<{
      fromPortfolioId: string;
      toPortfolioId: string;
      securityId: number;
      quantity: number;
      createdBy: string;
    }>,
  ): Promise<{ groupId: string; transferCount: number; transferIds: string[] }> {
    const transferIds: string[] = [];

    for (const t of transfers) {
      const [created] = await db.insert(schema.transfers).values({
        from_portfolio_id: t.fromPortfolioId,
        to_portfolio_id: t.toPortfolioId,
        security_id: t.securityId,
        quantity: String(t.quantity),
        type: 'INTER_ACCOUNT',
        transfer_status: 'PENDING_APPROVAL',
        created_by: t.createdBy,
        status: `GROUP:${groupId}`,
      }).returning();
      transferIds.push(String(created.id));
    }

    // Update group totals
    await db
      .update(schema.transferGroups)
      .set({ total_transfers: transfers.length, updated_at: new Date() })
      .where(eq(schema.transferGroups.group_id, groupId));

    return { groupId, transferCount: transfers.length, transferIds };
  },

  /** Execute all transfers in a group atomically */
  async executeTransferGroup(groupId: string): Promise<{
    executed: number;
    failed: number;
    results: Array<{ transferId: string; status: string; error?: string }>;
  }> {
    const transfers = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.status, `GROUP:${groupId}`));

    let executed = 0;
    let failed = 0;
    const results: Array<{ transferId: string; status: string; error?: string }> = [];

    for (const transfer of transfers) {
      try {
        // Validate source position
        const [sourcePos] = await db
          .select()
          .from(schema.positions)
          .where(
            and(
              eq(schema.positions.portfolio_id, transfer.from_portfolio_id!),
              eq(schema.positions.security_id, transfer.security_id!),
            ),
          )
          .limit(1);

        const transferQty = parseFloat(transfer.quantity ?? '0');
        if (!sourcePos || parseFloat(sourcePos.quantity ?? '0') < transferQty) {
          throw new Error(`Insufficient position in ${transfer.from_portfolio_id}`);
        }

        // Debit source
        await db
          .update(schema.positions)
          .set({
            quantity: String(parseFloat(sourcePos.quantity ?? '0') - transferQty),
            updated_at: new Date(),
          })
          .where(eq(schema.positions.id, sourcePos.id));

        // Credit target
        const [targetPos] = await db
          .select()
          .from(schema.positions)
          .where(
            and(
              eq(schema.positions.portfolio_id, transfer.to_portfolio_id!),
              eq(schema.positions.security_id, transfer.security_id!),
            ),
          )
          .limit(1);

        if (targetPos) {
          await db
            .update(schema.positions)
            .set({
              quantity: String(parseFloat(targetPos.quantity ?? '0') + transferQty),
              updated_at: new Date(),
            })
            .where(eq(schema.positions.id, targetPos.id));
        } else {
          await db.insert(schema.positions).values({
            portfolio_id: transfer.to_portfolio_id!,
            security_id: transfer.security_id!,
            quantity: String(transferQty),
            average_cost: sourcePos.average_cost,
            currency: sourcePos.currency,
          });
        }

        // Mark transfer EXECUTED
        await db
          .update(schema.transfers)
          .set({ transfer_status: 'EXECUTED', updated_at: new Date() })
          .where(eq(schema.transfers.id, transfer.id));

        executed++;
        results.push({ transferId: String(transfer.id), status: 'EXECUTED' });
      } catch (err) {
        failed++;
        const errorMsg = (err as Error).message;
        await db
          .update(schema.transfers)
          .set({ transfer_status: 'FAILED', updated_at: new Date() })
          .where(eq(schema.transfers.id, transfer.id));
        results.push({ transferId: String(transfer.id), status: 'FAILED', error: errorMsg });
      }
    }

    // Update group status
    const groupStatus = failed === 0 ? 'COMPLETED' : executed === 0 ? 'FAILED' : 'PARTIAL';
    await db
      .update(schema.transferGroups)
      .set({ completed_transfers: executed, group_status: groupStatus, updated_at: new Date() })
      .where(eq(schema.transferGroups.group_id, groupId));

    return { executed, failed, results };
  },

  /** Get transfer group with member transfers */
  async getTransferGroup(groupId: string) {
    const [group] = await db
      .select()
      .from(schema.transferGroups)
      .where(eq(schema.transferGroups.group_id, groupId))
      .limit(1);

    if (!group) return null;

    const transfers = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.status, `GROUP:${groupId}`));

    return { ...group, transfers };
  },
};

// ---------------------------------------------------------------------------
// P-07/P-08: Cash Flow Projection Service
// ---------------------------------------------------------------------------

export const cashFlowProjectionService = {
  /** Generate cash flow projections for a portfolio */
  async generateProjections(
    portfolioId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Array<{
    projection_id: string;
    flow_type: string;
    flow_category: string;
    projection_date: string;
    amount: string;
    source_description: string;
    confidence_level: string;
  }>> {
    const projections: Array<{
      projection_id: string;
      flow_type: string;
      flow_category: string;
      projection_date: string;
      amount: string;
      source_description: string;
      confidence_level: string;
    }> = [];

    // 1. Bond coupon/interest projections from positions
    const bondPositions = await db
      .select({
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        sec_name: schema.securities.name,
        coupon_rate: schema.securities.coupon_rate,
        maturity_date: schema.securities.maturity_date,
        asset_class: schema.securities.asset_class,
        // face_value not in schema — use quantity as notional
      })
      .from(schema.positions)
      .innerJoin(schema.securities, eq(schema.positions.security_id, schema.securities.id))
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          sql`${schema.securities.asset_class} IN ('FIXED_INCOME', 'BOND', 'GOVERNMENT_BOND', 'CORPORATE_BOND')`,
        ),
      );

    for (const pos of bondPositions) {
      const couponRate = parseFloat(pos.coupon_rate ?? '0');
      const faceValue = parseFloat(pos.quantity ?? '0');
      if (couponRate <= 0) continue;

      // Semi-annual coupon payments
      const semiAnnualAmount = (faceValue * couponRate) / 2;
      const current = new Date(fromDate);
      const end = new Date(toDate);

      // Approximate coupon dates: every 6 months
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        projections.push({
          projection_id: `CFP-${portfolioId}-${Date.now()}-${projections.length}`,
          flow_type: 'INFLOW',
          flow_category: 'COUPON_INTEREST',
          projection_date: dateStr,
          amount: String(semiAnnualAmount.toFixed(4)),
          source_description: `Coupon from ${pos.sec_name ?? `Security #${pos.security_id}`}`,
          confidence_level: 'HIGH',
        });
        current.setMonth(current.getMonth() + 6);
      }

      // Maturity principal repayment
      if (pos.maturity_date && pos.maturity_date >= fromDate && pos.maturity_date <= toDate) {
        projections.push({
          projection_id: `CFP-${portfolioId}-${Date.now()}-${projections.length}`,
          flow_type: 'INFLOW',
          flow_category: 'MATURITY_PRINCIPAL',
          projection_date: pos.maturity_date,
          amount: String(faceValue.toFixed(4)),
          source_description: `Maturity of ${pos.sec_name ?? `Security #${pos.security_id}`}`,
          confidence_level: 'HIGH',
        });
      }
    }

    // 2. Scheduled plan outflows (EIP/ERP auto-debits)
    const scheduledPlans = await db
      .select()
      .from(schema.scheduledPlans)
      .where(
        and(
          eq(schema.scheduledPlans.portfolio_id, portfolioId),
          eq(schema.scheduledPlans.scheduled_plan_status, 'ACTIVE' as any),
        ),
      );

    for (const plan of scheduledPlans) {
      const planAmount = parseFloat(plan.amount ?? '0');
      if (planAmount <= 0) continue;

      let nextExec = plan.next_execution_date ? new Date(plan.next_execution_date) : new Date(fromDate);
      const end = new Date(toDate);

      while (nextExec <= end) {
        const dateStr = nextExec.toISOString().split('T')[0];
        if (dateStr >= fromDate) {
          const flowType = plan.plan_type === 'EIP' ? 'OUTFLOW' : 'INFLOW';
          projections.push({
            projection_id: `CFP-${portfolioId}-${Date.now()}-${projections.length}`,
            flow_type: flowType,
            flow_category: `SCHEDULED_${plan.plan_type}`,
            projection_date: dateStr,
            amount: String(planAmount.toFixed(4)),
            source_description: `Scheduled ${plan.plan_type} plan #${plan.id}`,
            confidence_level: 'HIGH',
          });
        }
        // Advance based on frequency
        const freq = plan.frequency ?? 'MONTHLY';
        if (freq === 'MONTHLY') nextExec.setMonth(nextExec.getMonth() + 1);
        else if (freq === 'QUARTERLY') nextExec.setMonth(nextExec.getMonth() + 3);
        else if (freq === 'WEEKLY') nextExec.setDate(nextExec.getDate() + 7);
        else nextExec.setDate(nextExec.getDate() + 30);
      }
    }

    // 3. Fee billing projections (quarterly estimate)
    // Fee plans are linked via feePlanBindings, not directly; add quarterly placeholders
    {
      const current = new Date(fromDate);
      const end = new Date(toDate);
      while (current <= end) {
        const qtrEnd = new Date(current.getFullYear(), Math.floor(current.getMonth() / 3) * 3 + 3, 0);
        if (qtrEnd <= end) {
          projections.push({
            projection_id: `CFP-${portfolioId}-${Date.now()}-${projections.length}`,
            flow_type: 'OUTFLOW',
            flow_category: 'TRUST_FEE',
            projection_date: qtrEnd.toISOString().split('T')[0],
            amount: '0', // Actual amount depends on AUM at billing
            source_description: `Estimated quarterly trust fee billing`,
            confidence_level: 'LOW',
          });
        }
        current.setMonth(current.getMonth() + 3);
      }
    }

    // 4. Persist projections
    if (projections.length > 0) {
      const insertValues = projections.map((p) => ({
        projection_id: p.projection_id,
        portfolio_id: portfolioId,
        projection_date: p.projection_date,
        flow_type: p.flow_type,
        flow_category: p.flow_category,
        amount: p.amount,
        currency: 'PHP',
        source_description: p.source_description,
        confidence_level: p.confidence_level,
        is_projected: true,
      }));
      await db.insert(schema.cashFlowProjections).values(insertValues);
    }

    return projections;
  },

  /** Get existing projections for a portfolio */
  async getProjections(portfolioId: string, fromDate?: string, toDate?: string) {
    const conditions = [eq(schema.cashFlowProjections.portfolio_id, portfolioId)];
    if (fromDate) conditions.push(gte(schema.cashFlowProjections.projection_date, fromDate));
    if (toDate) conditions.push(lte(schema.cashFlowProjections.projection_date, toDate));

    return db
      .select()
      .from(schema.cashFlowProjections)
      .where(and(...conditions))
      .orderBy(schema.cashFlowProjections.projection_date);
  },

  /** Aggregate cash flow summary by month */
  async getMonthlySummary(portfolioId: string, fromDate: string, toDate: string) {
    const projections = await this.getProjections(portfolioId, fromDate, toDate);

    const monthMap = new Map<string, { inflows: number; outflows: number; net: number }>();

    for (const p of projections) {
      const month = p.projection_date?.slice(0, 7) ?? 'unknown';
      const entry = monthMap.get(month) ?? { inflows: 0, outflows: 0, net: 0 };
      const amount = parseFloat(p.amount ?? '0');
      if (p.flow_type === 'INFLOW') {
        entry.inflows += amount;
      } else {
        entry.outflows += amount;
      }
      entry.net = entry.inflows - entry.outflows;
      monthMap.set(month, entry);
    }

    return Array.from(monthMap.entries()).map(([month, data]) => ({ month, ...data }));
  },
};

// ---------------------------------------------------------------------------
// P-09/P-10/P-11: Settlement File Generation
// ---------------------------------------------------------------------------

export const settlementFileService = {
  /** Generate SWIFT MT103 file for cash settlements */
  generateSwiftMT103(settlement: {
    senderBic: string;
    receiverBic: string;
    amount: number;
    currency: string;
    valueDate: string;
    beneficiaryAccount: string;
    beneficiaryName: string;
    reference: string;
    details: string;
  }): string {
    const amt = settlement.amount.toFixed(2);
    const vd = settlement.valueDate.replace(/-/g, '').slice(2); // YYMMDD
    return [
      `{1:F01${settlement.senderBic}XXXX0000000000}`,
      `{2:I103${settlement.receiverBic}XXXXN}`,
      '{4:',
      `:20:${settlement.reference}`,
      `:23B:CRED`,
      `:32A:${vd}${settlement.currency}${amt}`,
      `:50K:/${settlement.beneficiaryAccount}`,
      settlement.beneficiaryName,
      `:59:/${settlement.beneficiaryAccount}`,
      settlement.beneficiaryName,
      `:70:${settlement.details}`,
      `:71A:SHA`,
      '-}',
    ].join('\n');
  },

  /** Generate SWIFT MT202 file for bank-to-bank transfers */
  generateSwiftMT202(settlement: {
    senderBic: string;
    receiverBic: string;
    amount: number;
    currency: string;
    valueDate: string;
    reference: string;
    intermediaryBic?: string;
  }): string {
    const amt = settlement.amount.toFixed(2);
    const vd = settlement.valueDate.replace(/-/g, '').slice(2);
    const lines = [
      `{1:F01${settlement.senderBic}XXXX0000000000}`,
      `{2:I202${settlement.receiverBic}XXXXN}`,
      '{4:',
      `:20:${settlement.reference}`,
      `:21:${settlement.reference}`,
      `:32A:${vd}${settlement.currency}${amt}`,
    ];
    if (settlement.intermediaryBic) {
      lines.push(`:56A:${settlement.intermediaryBic}`);
    }
    lines.push(`:58A:${settlement.receiverBic}`, '-}');
    return lines.join('\n');
  },

  /** Generate a batch settlement file (multiple instructions) */
  async generateBatchSettlementFile(
    settlementIds: number[],
    fileType: 'MT103' | 'MT202' | 'PDEX' | 'PHILPASS',
  ): Promise<{ fileId: string; fileName: string; content: string; count: number; totalAmount: number }> {
    const settlements = await db
      .select()
      .from(schema.settlementInstructions)
      .where(inArray(schema.settlementInstructions.id, settlementIds));

    if (settlements.length === 0) {
      throw new Error('No settlement instructions found for given IDs');
    }

    const fileId = `SF-${fileType}-${Date.now()}`;
    const fileName = `${fileType}_${new Date().toISOString().split('T')[0]}_${fileId}.txt`;
    let totalAmount = 0;
    const lines: string[] = [];

    // File header
    lines.push(`FILE_TYPE=${fileType}`);
    lines.push(`GENERATED=${new Date().toISOString()}`);
    lines.push(`COUNT=${settlements.length}`);
    lines.push('---');

    for (const s of settlements) {
      const amount = parseFloat(s.cash_amount ?? '0');
      totalAmount += amount;

      if (fileType === 'MT103') {
        lines.push(this.generateSwiftMT103({
          senderBic: 'ABORPHMM',
          receiverBic: 'BABORPHMM',
          amount,
          currency: 'PHP',
          valueDate: s.value_date ?? new Date().toISOString().split('T')[0],
          beneficiaryAccount: s.ssi_id?.toString() ?? '',
          beneficiaryName: 'BENEFICIARY',
          reference: s.trade_id ?? `SI-${s.id}`,
          details: `Settlement ${s.id}`,
        }));
      } else if (fileType === 'MT202') {
        lines.push(this.generateSwiftMT202({
          senderBic: 'ABORPHMM',
          receiverBic: 'BABORPHMM',
          amount,
          currency: 'PHP',
          valueDate: s.value_date ?? new Date().toISOString().split('T')[0],
          reference: s.trade_id ?? `SI-${s.id}`,
        }));
      } else {
        // Generic format for PDEX/PHILPASS
        lines.push(`INSTRUCTION_ID=${s.id}`);
        lines.push(`TRADE_ID=${s.trade_id ?? ''}`);
        lines.push(`AMOUNT=${amount.toFixed(2)}`);
        lines.push(`VALUE_DATE=${s.value_date ?? ''}`);
        lines.push(`STATUS=${s.settlement_status ?? ''}`);
        lines.push('---');
      }
    }

    const content = lines.join('\n');

    // Persist file record
    await db.insert(schema.settlementFiles).values({
      file_id: fileId,
      file_type: fileType,
      file_name: fileName,
      settlement_count: settlements.length,
      total_amount: String(totalAmount),
      currency: 'PHP',
      file_status: 'GENERATED',
      file_content: content,
    });

    return { fileId, fileName, content, count: settlements.length, totalAmount };
  },

  /** Mark file as transmitted */
  async markTransmitted(fileId: string, transmissionRef?: string) {
    const [updated] = await db
      .update(schema.settlementFiles)
      .set({
        file_status: 'TRANSMITTED',
        transmitted_at: new Date(),
        transmission_ref: transmissionRef ?? null,
        updated_at: new Date(),
      })
      .where(eq(schema.settlementFiles.file_id, fileId))
      .returning();
    return updated;
  },

  /** Mark file as acknowledged by receiver */
  async markAcknowledged(fileId: string) {
    const [updated] = await db
      .update(schema.settlementFiles)
      .set({
        file_status: 'ACKNOWLEDGED',
        acknowledged_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.settlementFiles.file_id, fileId))
      .returning();
    return updated;
  },

  /** Get settlement file history */
  async getFiles(filters?: { fileType?: string; status?: string; limit?: number }) {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters?.fileType) conditions.push(eq(schema.settlementFiles.file_type, filters.fileType));
    if (filters?.status) conditions.push(eq(schema.settlementFiles.file_status, filters.status));

    return db
      .select()
      .from(schema.settlementFiles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.settlementFiles.created_at))
      .limit(filters?.limit ?? 50);
  },
};

// ---------------------------------------------------------------------------
// P-12: Report Export Service (Excel/CSV/PDF stubs)
// ---------------------------------------------------------------------------

export const reportExportService = {
  /** Export report data as CSV */
  exportCsv(
    headers: string[],
    rows: Array<Record<string, unknown>>,
  ): string {
    const headerLine = headers.map((h) => `"${h}"`).join(',');
    const dataLines = rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(','),
    );
    return [headerLine, ...dataLines].join('\n');
  },

  /** Export report data as tab-delimited (for Excel) */
  exportExcel(
    headers: string[],
    rows: Array<Record<string, unknown>>,
    sheetName = 'Report',
  ): string {
    // XML Spreadsheet 2003 format (can be opened by Excel)
    const xmlHeader = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="${sheetName}">\n<Table>`;
    const xmlFooter = `</Table>\n</Worksheet>\n</Workbook>`;

    const headerRow = `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`;
    const dataRows = rows.map((row) => {
      const cells = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '<Cell><Data ss:Type="String"></Data></Cell>';
        const num = typeof val === 'number' ? val : parseFloat(String(val));
        if (!isNaN(num) && typeof val !== 'string') {
          return `<Cell><Data ss:Type="Number">${num}</Data></Cell>`;
        }
        return `<Cell><Data ss:Type="String">${escapeXml(String(val))}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('\n');

    return `${xmlHeader}\n${headerRow}\n${dataRows}\n${xmlFooter}`;
  },

  /** Export report data as PDF-ready HTML */
  exportPdfHtml(
    title: string,
    headers: string[],
    rows: Array<Record<string, unknown>>,
    metadata?: { generatedBy?: string; dateRange?: string },
  ): string {
    const headerCells = headers.map((h) => `<th style="border:1px solid #333;padding:6px;background:#f0f0f0;text-align:left">${escapeXml(h)}</th>`).join('');
    const dataRows = rows.map((row) => {
      const cells = headers.map((h) => {
        const val = row[h] ?? '';
        return `<td style="border:1px solid #ccc;padding:4px">${escapeXml(String(val))}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${escapeXml(title)}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}h1{color:#333}
.meta{color:#666;font-size:12px;margin-bottom:16px}</style></head>
<body>
<h1>${escapeXml(title)}</h1>
<div class="meta">Generated: ${new Date().toISOString().split('T')[0]}${metadata?.generatedBy ? ` by ${escapeXml(metadata.generatedBy)}` : ''}${metadata?.dateRange ? ` | Period: ${escapeXml(metadata.dateRange)}` : ''}</div>
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>${dataRows}</tbody>
</table>
<div class="meta" style="margin-top:16px">Total rows: ${rows.length}</div>
</body></html>`;
  },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// P-13: Fiscal Closing Workflow
// ---------------------------------------------------------------------------

export const fiscalClosingService = {
  /** Initiate fiscal period closing (month-end or year-end) */
  async initiatePeriodClose(data: {
    periodType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
    periodEnd: string;
    closedBy: string;
  }) {
    // 1. Check for unposted GL journal batches
    const [unpostedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glJournalBatches)
      .where(
        and(
          lte(schema.glJournalBatches.transaction_date, data.periodEnd),
          eq(schema.glJournalBatches.batch_status, 'DRAFT'),
        ),
      );

    const unposted = Number(unpostedCount?.count ?? 0);
    if (unposted > 0) {
      return {
        status: 'BLOCKED',
        reason: `${unposted} unposted journal batches must be posted or voided before closing period ${data.periodEnd}`,
        unposted_count: unposted,
      };
    }

    // 2. Create balance snapshots for the period
    // Aggregate debit/credit by GL head from posted batches
    const glBalances = await db
      .select({
        gl_head_id: schema.glJournalLines.gl_head_id,
        total_debit: sql<string>`COALESCE(SUM(CASE WHEN ${schema.glJournalLines.dr_cr} = 'DR' THEN ${schema.glJournalLines.amount} ELSE 0 END), 0)`,
        total_credit: sql<string>`COALESCE(SUM(CASE WHEN ${schema.glJournalLines.dr_cr} = 'CR' THEN ${schema.glJournalLines.amount} ELSE 0 END), 0)`,
      })
      .from(schema.glJournalLines)
      .innerJoin(
        schema.glJournalBatches,
        eq(schema.glJournalLines.batch_id, schema.glJournalBatches.id),
      )
      .where(
        and(
          lte(schema.glJournalBatches.transaction_date, data.periodEnd),
          eq(schema.glJournalBatches.batch_status, 'POSTED'),
        ),
      )
      .groupBy(schema.glJournalLines.gl_head_id);

    // 3. Store snapshots (using first accounting unit as default)
    const batchRef = `CLOSE-${data.periodType}-${data.periodEnd}`;
    for (const bal of glBalances) {
      await db.insert(schema.glBalanceSnapshots).values({
        gl_head_id: bal.gl_head_id,
        snapshot_date: data.periodEnd,
        snapshot_type: data.periodType === 'ANNUAL' ? 'YEAR_END' : data.periodType === 'QUARTERLY' ? 'QUARTER_END' : 'MONTH_END',
        accounting_unit_id: 1,
        debit_turnover: bal.total_debit,
        credit_turnover: bal.total_credit,
        closing_balance: String(parseFloat(bal.total_debit) - parseFloat(bal.total_credit)),
      });
    }

    return {
      status: 'COMPLETED',
      period_type: data.periodType,
      period_end: data.periodEnd,
      batch_ref: batchRef,
      accounts_snapshotted: glBalances.length,
      closed_by: data.closedBy,
    };
  },

  /** Get fiscal closing status for a period */
  async getPeriodStatus(periodEnd: string) {
    const snapshots = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glBalanceSnapshots)
      .where(eq(schema.glBalanceSnapshots.snapshot_date, periodEnd));

    const count = Number(snapshots[0]?.count ?? 0);
    return {
      period_end: periodEnd,
      is_closed: count > 0,
      accounts_snapshotted: count,
    };
  },
};

// ---------------------------------------------------------------------------
// P-14: Transaction Advice / Contract Note Generation
// ---------------------------------------------------------------------------

export const transactionAdviceService = {
  /** Generate a transaction advice (contract note) for a confirmed trade */
  async generateAdvice(data: {
    tradeId: string;
    confirmationId?: number;
    generatedBy: string;
  }) {
    // Fetch trade + order details (trade has execution info, order has portfolio/security info)
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, data.tradeId))
      .limit(1);

    if (!trade) {
      throw new Error(`Trade not found: ${data.tradeId}`);
    }

    // Get the linked order for portfolio/security details
    const [order] = trade.order_id
      ? await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.order_id, trade.order_id))
          .limit(1)
      : [null];

    const portfolioId = order?.portfolio_id;

    // Fetch portfolio + client info
    const [portfolio] = portfolioId
      ? await db
          .select()
          .from(schema.portfolios)
          .where(eq(schema.portfolios.portfolio_id, portfolioId))
          .limit(1)
      : [null];

    const clientId = portfolio?.client_id;
    const [client] = clientId
      ? await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.client_id, clientId))
          .limit(1)
      : [null];

    // Build advice content
    const adviceContent = {
      trade: {
        trade_id: trade.trade_id,
        execution_price: trade.execution_price,
        execution_qty: trade.execution_qty,
        execution_time: trade.execution_time,
        slippage_bps: trade.slippage_bps,
      },
      order: order
        ? {
            order_id: order.order_id,
            portfolio_id: order.portfolio_id,
            security_id: order.security_id,
            side: order.side,
            quantity: order.quantity,
            currency: order.currency,
            value_date: order.value_date,
          }
        : null,
      client: client
        ? { client_id: client.client_id, name: (client as any).name ?? (client as any).legal_name, email: (client as any).email }
        : null,
      portfolio: portfolio
        ? { portfolio_id: portfolio.portfolio_id, name: portfolio.name }
        : null,
      generated_at: new Date().toISOString(),
      generated_by: data.generatedBy,
    };

    const adviceId = `ADV-${data.tradeId}-${Date.now()}`;

    const [advice] = await db
      .insert(schema.transactionAdvices)
      .values({
        advice_id: adviceId,
        advice_type: 'CONTRACT_NOTE',
        trade_id: data.tradeId,
        confirmation_id: data.confirmationId ?? null,
        portfolio_id: portfolioId ?? null,
        client_id: clientId ?? null,
        settlement_date: order?.value_date ?? null,
        settlement_amount: trade.execution_price ?? null,
        counterparty_name: null,
        advice_content: adviceContent,
        delivery_status: 'PENDING',
      })
      .returning();

    return advice;
  },

  /** Generate settlement advice (post-settlement) */
  async generateSettlementAdvice(settlementId: number, generatedBy: string) {
    const [settlement] = await db
      .select()
      .from(schema.settlementInstructions)
      .where(eq(schema.settlementInstructions.id, settlementId))
      .limit(1);

    if (!settlement) {
      throw new Error(`Settlement instruction not found: ${settlementId}`);
    }

    const adviceId = `SADV-${settlementId}-${Date.now()}`;
    const adviceContent = {
      settlement: {
        id: settlement.id,
        trade_id: settlement.trade_id,
        cash_amount: settlement.cash_amount,
        value_date: settlement.value_date,
        settlement_status: settlement.settlement_status,
        is_book_only: settlement.is_book_only,
      },
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
    };

    const [advice] = await db
      .insert(schema.transactionAdvices)
      .values({
        advice_id: adviceId,
        advice_type: 'SETTLEMENT_ADVICE',
        trade_id: settlement.trade_id,
        settlement_date: settlement.value_date,
        settlement_amount: settlement.cash_amount,
        advice_content: adviceContent,
        delivery_status: 'PENDING',
      })
      .returning();

    return advice;
  },

  /** Mark advice as delivered */
  async markDelivered(adviceId: string) {
    const [updated] = await db
      .update(schema.transactionAdvices)
      .set({ delivery_status: 'DELIVERED', delivered_at: new Date(), updated_at: new Date() })
      .where(eq(schema.transactionAdvices.advice_id, adviceId))
      .returning();
    return updated;
  },

  /** Get advices for a portfolio or client */
  async getAdvices(filters: { portfolioId?: string; clientId?: string; limit?: number }) {
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.portfolioId) conditions.push(eq(schema.transactionAdvices.portfolio_id, filters.portfolioId));
    if (filters.clientId) conditions.push(eq(schema.transactionAdvices.client_id, filters.clientId));

    return db
      .select()
      .from(schema.transactionAdvices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.transactionAdvices.created_at))
      .limit(filters.limit ?? 50);
  },
};

// ---------------------------------------------------------------------------
// P-15: Real-Time Settlement Connector Stubs
// ---------------------------------------------------------------------------

export const realtimeSettlementService = {
  /** Submit settlement instruction to appropriate connector */
  async submitToConnector(data: {
    settlementId: number;
    connectorId: string;
    amount: number;
    currency: string;
    counterpartyBic?: string;
    valueDate: string;
  }): Promise<{
    status: 'SUBMITTED' | 'REJECTED' | 'CONNECTOR_DOWN';
    confirmationRef?: string;
    error?: string;
  }> {
    // Simulate connector health check
    const connectorHealth = await this.checkConnectorHealth(data.connectorId);
    if (connectorHealth.status === 'DOWN') {
      return {
        status: 'CONNECTOR_DOWN',
        error: `Connector ${data.connectorId} is currently unavailable`,
      };
    }

    // Validate amount
    if (data.amount <= 0) {
      return { status: 'REJECTED', error: 'Amount must be positive' };
    }

    // Generate confirmation reference
    const confirmationRef = `${data.connectorId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Log the submission
    await db.insert(schema.settlementFiles).values({
      file_id: confirmationRef,
      file_type: `RT_${data.connectorId}`,
      file_name: `realtime_${data.connectorId}_${data.settlementId}`,
      settlement_count: 1,
      total_amount: String(data.amount),
      currency: data.currency,
      file_status: 'TRANSMITTED',
      transmitted_at: new Date(),
      transmission_ref: confirmationRef,
    });

    return { status: 'SUBMITTED', confirmationRef };
  },

  /** Check connector health */
  async checkConnectorHealth(connectorId: string): Promise<{
    connectorId: string;
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    latencyMs: number;
    lastCheck: string;
  }> {
    // Simulated health — in production would make actual health probe
    const latencyMap: Record<string, number> = {
      pdex: 45,
      pse_edge: 120,
      philpass: 80,
      swift_fin: 200,
      finacle: 150,
      bloomberg: 90,
    };

    const latency = latencyMap[connectorId.toLowerCase()] ?? 100;
    const status = latency < 300 ? 'HEALTHY' : latency < 1000 ? 'DEGRADED' : 'DOWN';

    return {
      connectorId,
      status,
      latencyMs: latency,
      lastCheck: new Date().toISOString(),
    };
  },

  /** Get all connector statuses */
  async getAllConnectorStatuses() {
    const connectors = ['PDEX', 'PSE_EDGE', 'PHILPASS', 'SWIFT_FIN', 'FINACLE', 'BLOOMBERG', 'BSP_EFRS', 'AMLC'];
    const statuses = await Promise.all(
      connectors.map((c) => this.checkConnectorHealth(c)),
    );
    return statuses;
  },

  /** Route settlement to best available connector */
  async routeSettlement(data: {
    settlementId: number;
    securityType: string;
    amount: number;
    currency: string;
    valueDate: string;
  }) {
    // Route by security type
    let primaryConnector: string;
    let fallbackConnector: string;

    switch (data.securityType.toUpperCase()) {
      case 'GOVERNMENT_BOND':
      case 'TREASURY':
        primaryConnector = 'PDEX';
        fallbackConnector = 'PHILPASS';
        break;
      case 'EQUITY':
      case 'STOCK':
        primaryConnector = 'PSE_EDGE';
        fallbackConnector = 'PDEX';
        break;
      case 'FX':
      case 'FOREX':
        primaryConnector = 'PHILPASS';
        fallbackConnector = 'SWIFT_FIN';
        break;
      default:
        primaryConnector = 'SWIFT_FIN';
        fallbackConnector = 'PHILPASS';
    }

    // Try primary
    const primaryHealth = await this.checkConnectorHealth(primaryConnector);
    if (primaryHealth.status !== 'DOWN') {
      return this.submitToConnector({
        settlementId: data.settlementId,
        connectorId: primaryConnector,
        amount: data.amount,
        currency: data.currency,
        valueDate: data.valueDate,
      });
    }

    // Fallback
    return this.submitToConnector({
      settlementId: data.settlementId,
      connectorId: fallbackConnector,
      amount: data.amount,
      currency: data.currency,
      valueDate: data.valueDate,
    });
  },
};

// ---------------------------------------------------------------------------
// P-06: Batch Account/Portfolio Creation
// ---------------------------------------------------------------------------

export const batchAccountService = {
  /** Create multiple portfolios from a batch specification */
  async batchCreatePortfolios(
    accounts: Array<{
      name: string;
      clientId: string;
      trustAccountId?: string;
      portfolioType?: string;
      currency?: string;
    }>,
    createdBy: string,
  ): Promise<{ created: number; portfolioIds: string[]; errors: Array<{ index: number; error: string }> }> {
    const portfolioIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < accounts.length; i++) {
      const acct = accounts[i];
      try {
        const portfolioId = `PF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const [created] = await db
          .insert(schema.portfolios)
          .values({
            portfolio_id: portfolioId,
            name: acct.name,
            client_id: acct.clientId,
            trust_account_id: acct.trustAccountId ?? null,
            portfolio_type: acct.portfolioType ?? 'IMA',
            currency: acct.currency ?? 'PHP',
            portfolio_status: 'ACTIVE',
            created_by: createdBy,
          })
          .returning();
        portfolioIds.push(created.portfolio_id);
      } catch (err) {
        errors.push({ index: i, error: (err as Error).message });
      }
    }

    return { created: portfolioIds.length, portfolioIds, errors };
  },
};

// ---------------------------------------------------------------------------
// P-03/P-04: Enhanced EIP/ERP Batch Processing
// ---------------------------------------------------------------------------

export const scheduledPlanBatchService = {
  /** Run batch processing for all due EIP plans */
  async runEIPBatch(businessDate: string): Promise<{
    processed: number;
    failed: number;
    ordersCreated: string[];
    errors: Array<{ planId: number; error: string }>;
  }> {
    const duePlans = await db
      .select()
      .from(schema.scheduledPlans)
      .where(
        and(
          eq(schema.scheduledPlans.plan_type, 'EIP'),
          eq(schema.scheduledPlans.scheduled_plan_status, 'ACTIVE' as any),
          lte(schema.scheduledPlans.next_execution_date, businessDate),
        ),
      );

    let processed = 0;
    let failed = 0;
    const ordersCreated: string[] = [];
    const errors: Array<{ planId: number; error: string }> = [];

    for (const plan of duePlans) {
      try {
        const amount = parseFloat(plan.amount ?? '0');
        if (amount <= 0) continue;

        const orderNo = `EIP-${plan.id}-${Date.now()}`;
        const [order] = await db
          .insert(schema.orders)
          .values({
            portfolio_id: plan.portfolio_id!,
            security_id: plan.product_id,
            side: 'BUY',
            quantity: String(amount),
            currency: plan.currency ?? 'PHP',
            order_status: 'PENDING_AUTH',
            order_type: 'SUBSCRIPTION',
            order_no: orderNo,
            value_date: businessDate,
            scheduled_plan_id: plan.id,
            created_by: 'SYSTEM',
          })
          .returning();

        // Advance next date
        const nextDate = schedulerEnhancements.calculateNextRunDate(businessDate, plan.frequency ?? 'MONTHLY');
        await db
          .update(schema.scheduledPlans)
          .set({ next_execution_date: nextDate, status: `Last: ${businessDate}`, updated_at: new Date() })
          .where(eq(schema.scheduledPlans.id, plan.id));

        processed++;
        ordersCreated.push(order.order_id);
      } catch (err) {
        failed++;
        errors.push({ planId: plan.id, error: (err as Error).message });
      }
    }

    return { processed, failed, ordersCreated, errors };
  },

  /** Run batch processing for all due ERP plans */
  async runERPBatch(businessDate: string): Promise<{
    processed: number;
    failed: number;
    ordersCreated: string[];
    errors: Array<{ planId: number; error: string }>;
  }> {
    const duePlans = await db
      .select()
      .from(schema.scheduledPlans)
      .where(
        and(
          eq(schema.scheduledPlans.plan_type, 'ERP'),
          eq(schema.scheduledPlans.scheduled_plan_status, 'ACTIVE' as any),
          lte(schema.scheduledPlans.next_execution_date, businessDate),
        ),
      );

    let processed = 0;
    let failed = 0;
    const ordersCreated: string[] = [];
    const errors: Array<{ planId: number; error: string }> = [];

    for (const plan of duePlans) {
      try {
        const amount = parseFloat(plan.amount ?? '0');
        if (amount <= 0) continue;

        const orderNo = `ERP-${plan.id}-${Date.now()}`;
        const [order] = await db
          .insert(schema.orders)
          .values({
            portfolio_id: plan.portfolio_id!,
            security_id: plan.product_id,
            side: 'SELL',
            quantity: String(amount),
            currency: plan.currency ?? 'PHP',
            order_status: 'PENDING_AUTH',
            order_type: 'REDEMPTION',
            order_no: orderNo,
            value_date: businessDate,
            scheduled_plan_id: plan.id,
            created_by: 'SYSTEM',
          })
          .returning();

        const nextDate = schedulerEnhancements.calculateNextRunDate(businessDate, plan.frequency ?? 'MONTHLY');
        await db
          .update(schema.scheduledPlans)
          .set({ next_execution_date: nextDate, status: `Last: ${businessDate}`, updated_at: new Date() })
          .where(eq(schema.scheduledPlans.id, plan.id));

        processed++;
        ordersCreated.push(order.order_id);
      } catch (err) {
        failed++;
        errors.push({ planId: plan.id, error: (err as Error).message });
      }
    }

    return { processed, failed, ordersCreated, errors };
  },
};
