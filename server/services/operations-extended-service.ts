/**
 * operations-extended-service.ts — Securities Services, Operations, Order Mgmt,
 * Risk Management, Reporting, and General Requirements
 *
 * Covers BDO RFI gaps:
 * - SS-01 through SS-06 (Securities Services)
 * - OPS-01 through OPS-07 (Operations)
 * - OM-01 through OM-03 (Order Management)
 * - RM-01, RM-02 (Risk Management)
 * - RA-01, RA-02 (Reporting & Analytics)
 * - GR-01 through GR-05 (General Requirements)
 */

import { eq, and, desc, asc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { NotFoundError, ValidationError } from './service-errors';

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ─── Securities Services (SS-01 through SS-06) ──────────────────────────────

export const securitiesService = {
  // SS-01/02: Stock transfers
  async listStockTransfers(securityId?: string) {
    let conditions = [eq(schema.stockTransfers.is_deleted, false)];
    if (securityId) conditions.push(eq(schema.stockTransfers.security_id, securityId));
    return db.select().from(schema.stockTransfers)
      .where(and(...conditions))
      .orderBy(desc(schema.stockTransfers.transfer_date));
  },

  async createStockTransfer(data: Record<string, any>, userId: string) {
    const transferId = generateId('STX');
    const [transfer] = await db.insert(schema.stockTransfers).values({
      transfer_id: transferId,
      security_id: data.security_id,
      transfer_type: data.transfer_type,
      share_class: data.share_class,
      is_scripless: data.is_scripless ?? false,
      transferor_name: data.transferor_name,
      transferor_account: data.transferor_account,
      transferee_name: data.transferee_name,
      transferee_account: data.transferee_account,
      quantity: data.quantity,
      transfer_date: data.transfer_date,
      settlement_date: data.settlement_date,
      certificate_number: data.certificate_number,
      new_certificate_number: data.new_certificate_number,
      transfer_status: 'PENDING',
      transfer_agent_ref: data.transfer_agent_ref,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return transfer;
  },

  async updateTransferStatus(transferId: string, status: string, userId: string) {
    const [updated] = await db.update(schema.stockTransfers)
      .set({ transfer_status: status as any, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.stockTransfers.transfer_id, transferId))
      .returning();
    if (!updated) throw new NotFoundError(`Transfer ${transferId} not found`);
    return updated;
  },

  // SS-05: Capture from former transfer agent
  async bulkImportTransfers(records: Record<string, any>[], sourceAgent: string, userId: string) {
    const results = [];
    for (const rec of records) {
      const result = await this.createStockTransfer({
        ...rec,
        transfer_agent_ref: sourceAgent,
        remarks: `Imported from ${sourceAgent}`,
      }, userId);
      results.push(result);
    }
    return { imported: results.length, records: results };
  },

  // SS-03: Stock rights
  async listStockRights(securityId?: string) {
    let conditions = [eq(schema.stockRights.is_deleted, false)];
    if (securityId) conditions.push(eq(schema.stockRights.security_id, securityId));
    return db.select().from(schema.stockRights)
      .where(and(...conditions))
      .orderBy(desc(schema.stockRights.record_date));
  },

  async createStockRight(data: Record<string, any>, userId: string) {
    const rightId = generateId('SRT');
    const [right] = await db.insert(schema.stockRights).values({
      right_id: rightId,
      ...data,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return right;
  },

  // SS-04: Unclaimed certificates
  async listUnclaimedCertificates() {
    return db.select().from(schema.unclaimedCertificates)
      .where(eq(schema.unclaimedCertificates.is_deleted, false))
      .orderBy(asc(schema.unclaimedCertificates.holder_name));
  },

  async createUnclaimedCertificate(data: Record<string, any>, userId: string) {
    const certId = generateId('UCR');
    const [cert] = await db.insert(schema.unclaimedCertificates).values({
      certificate_id: certId,
      ...data,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return cert;
  },

  // SS-06: Stockholder meetings
  async listStockholderMeetings(securityId?: string) {
    let conditions = [eq(schema.stockholderMeetings.is_deleted, false)];
    if (securityId) conditions.push(eq(schema.stockholderMeetings.security_id, securityId));
    return db.select().from(schema.stockholderMeetings)
      .where(and(...conditions))
      .orderBy(desc(schema.stockholderMeetings.meeting_date));
  },

  async createStockholderMeeting(data: Record<string, any>, userId: string) {
    const meetingId = generateId('SHM');
    const [meeting] = await db.insert(schema.stockholderMeetings).values({
      meeting_id: meetingId,
      ...data,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return meeting;
  },

  async recordVotingResults(meetingId: string, results: any, userId: string) {
    const [updated] = await db.update(schema.stockholderMeetings)
      .set({
        voting_results: results.voting_results,
        proxy_tabulation: results.proxy_tabulation,
        total_voted_shares: results.total_voted_shares,
        quorum_reached: results.quorum_reached,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.stockholderMeetings.meeting_id, meetingId))
      .returning();
    if (!updated) throw new NotFoundError(`Meeting ${meetingId} not found`);
    return updated;
  },
};

// ─── Operations (OPS-01 through OPS-07) ─────────────────────────────────────

export const operationsService = {
  // OPS-03: Bank reconciliation
  async listReconciliations(bankAccount?: string) {
    let conditions = [eq(schema.bankReconciliations.is_deleted, false)];
    if (bankAccount) conditions.push(eq(schema.bankReconciliations.bank_account, bankAccount));
    return db.select().from(schema.bankReconciliations)
      .where(and(...conditions))
      .orderBy(desc(schema.bankReconciliations.period_end));
  },

  async createReconciliation(data: Record<string, any>, userId: string) {
    const reconId = generateId('REC');
    const bankBal = parseFloat(data.bank_statement_balance ?? '0');
    const bookBal = parseFloat(data.book_balance ?? '0');
    const outChecks = parseFloat(data.outstanding_checks ?? '0');
    const dip = parseFloat(data.deposits_in_transit ?? '0');

    const adjustedBank = bankBal - outChecks + dip;
    const discrepancy = adjustedBank - bookBal;

    const [recon] = await db.insert(schema.bankReconciliations).values({
      reconciliation_id: reconId,
      bank_account: data.bank_account,
      period_start: data.period_start,
      period_end: data.period_end,
      bank_statement_balance: bankBal.toFixed(4),
      book_balance: bookBal.toFixed(4),
      outstanding_checks: outChecks.toFixed(4),
      deposits_in_transit: dip.toFixed(4),
      adjusted_bank_balance: adjustedBank.toFixed(4),
      adjusted_book_balance: bookBal.toFixed(4),
      is_reconciled: Math.abs(discrepancy) < 0.01,
      discrepancy: discrepancy.toFixed(4),
      items: data.items,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return recon;
  },

  // OPS-04: Check/number series management
  async listNumberSeries(seriesType?: string) {
    let conditions = [eq(schema.numberSeries.is_deleted, false)];
    if (seriesType) conditions.push(eq(schema.numberSeries.series_type, seriesType));
    return db.select().from(schema.numberSeries)
      .where(and(...conditions))
      .orderBy(asc(schema.numberSeries.series_type));
  },

  async createNumberSeries(data: Record<string, any>, userId: string) {
    const seriesId = generateId('NSR');
    const [series] = await db.insert(schema.numberSeries).values({
      series_id: seriesId,
      ...data,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return series;
  },

  async getNextNumber(seriesId: string): Promise<string> {
    const [series] = await db.select().from(schema.numberSeries)
      .where(eq(schema.numberSeries.series_id, seriesId)).limit(1);
    if (!series) throw new NotFoundError(`Series ${seriesId} not found`);
    if (!series.is_active) throw new ValidationError('Number series is inactive');

    const current = series.current_number ?? 1;
    const next = current + (series.increment_by ?? 1);
    if (series.max_number && next > series.max_number) {
      throw new ValidationError('Number series exhausted');
    }

    await db.update(schema.numberSeries)
      .set({ current_number: next, updated_at: new Date() })
      .where(eq(schema.numberSeries.series_id, seriesId));

    const numStr = String(current).padStart(6, '0');
    return `${series.prefix ?? ''}${numStr}${series.suffix ?? ''}`;
  },

  // OPS-03/05/06: Check register
  async listChecks(filters?: { status?: string; bank_account?: string }) {
    let conditions = [eq(schema.checkRegister.is_deleted, false)];
    if (filters?.status) conditions.push(eq(schema.checkRegister.check_status, filters.status as any));
    if (filters?.bank_account) conditions.push(eq(schema.checkRegister.bank_account, filters.bank_account));
    return db.select().from(schema.checkRegister)
      .where(and(...conditions))
      .orderBy(desc(schema.checkRegister.issue_date));
  },

  async issueCheck(data: Record<string, any>, userId: string) {
    const checkId = generateId('CHK');
    const [check] = await db.insert(schema.checkRegister).values({
      check_id: checkId,
      check_number: data.check_number,
      check_series: data.check_series,
      bank_account: data.bank_account,
      payee_name: data.payee_name,
      amount: data.amount,
      issue_date: data.issue_date ?? new Date().toISOString().split('T')[0],
      check_status: 'ISSUED',
      check_purpose: data.check_purpose,
      portfolio_id: data.portfolio_id,
      related_transaction_id: data.related_transaction_id,
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return check;
  },

  async updateCheckStatus(checkId: string, status: string, userId: string) {
    const dateField = status === 'CLEARED' ? 'clear_date' : status === 'VOIDED' ? 'void_date' : null;
    const update: any = {
      check_status: status,
      updated_by: userId,
      updated_at: new Date(),
    };
    if (dateField) update[dateField] = new Date().toISOString().split('T')[0];

    const [updated] = await db.update(schema.checkRegister)
      .set(update)
      .where(eq(schema.checkRegister.check_id, checkId))
      .returning();
    if (!updated) throw new NotFoundError(`Check ${checkId} not found`);
    return updated;
  },

  // OPS-02: Property depreciation
  async listProperties(portfolioId?: string) {
    let conditions = [eq(schema.propertyDepreciation.is_deleted, false)];
    if (portfolioId) conditions.push(eq(schema.propertyDepreciation.portfolio_id, portfolioId));
    return db.select().from(schema.propertyDepreciation)
      .where(and(...conditions))
      .orderBy(asc(schema.propertyDepreciation.asset_description));
  },

  async createProperty(data: Record<string, any>, userId: string) {
    const assetId = generateId('AST');
    const cost = parseFloat(data.acquisition_cost ?? '0');
    const salvage = parseFloat(data.salvage_value ?? '0');
    const [property] = await db.insert(schema.propertyDepreciation).values({
      asset_id: assetId,
      portfolio_id: data.portfolio_id,
      asset_description: data.asset_description,
      acquisition_date: data.acquisition_date,
      acquisition_cost: cost.toFixed(4),
      useful_life_years: data.useful_life_years,
      salvage_value: salvage.toFixed(4),
      depreciation_method: data.depreciation_method ?? 'STRAIGHT_LINE',
      accumulated_depreciation: '0',
      net_book_value: cost.toFixed(4),
      remarks: data.remarks,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return property;
  },

  async computeDepreciation(assetId: string, userId: string) {
    const [asset] = await db.select().from(schema.propertyDepreciation)
      .where(eq(schema.propertyDepreciation.asset_id, assetId)).limit(1);
    if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);

    const cost = parseFloat(asset.acquisition_cost ?? '0');
    const salvage = parseFloat(asset.salvage_value ?? '0');
    const useful = asset.useful_life_years ?? 1;
    const annualDepreciation = (cost - salvage) / useful;
    const accumulated = parseFloat(asset.accumulated_depreciation ?? '0') + annualDepreciation;
    const nbv = Math.max(salvage, cost - accumulated);

    const [updated] = await db.update(schema.propertyDepreciation)
      .set({
        accumulated_depreciation: accumulated.toFixed(4),
        net_book_value: nbv.toFixed(4),
        last_depreciation_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.propertyDepreciation.asset_id, assetId))
      .returning();
    return updated;
  },

  // OPS-01/07: Loan refunds & LGF reversals
  async listLoanRefunds(portfolioId?: string) {
    let conditions = [eq(schema.loanRefunds.is_deleted, false)];
    if (portfolioId) conditions.push(eq(schema.loanRefunds.portfolio_id, portfolioId));
    return db.select().from(schema.loanRefunds)
      .where(and(...conditions))
      .orderBy(desc(schema.loanRefunds.refund_date));
  },

  async createLoanRefund(data: Record<string, any>, userId: string) {
    const refundId = generateId('RFD');
    const [refund] = await db.insert(schema.loanRefunds).values({
      refund_id: refundId,
      ...data,
      approval_status: 'PENDING',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return refund;
  },

  async approveLoanRefund(refundId: string, userId: string) {
    const [updated] = await db.update(schema.loanRefunds)
      .set({ approval_status: 'APPROVED', approved_by: userId, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.loanRefunds.refund_id, refundId))
      .returning();
    if (!updated) throw new NotFoundError(`Refund ${refundId} not found`);
    return updated;
  },
};

// ─── Order Management Extensions (OM-01 through OM-03) ──────────────────────

export const orderExtensionService = {
  // OM-01: Trade import
  async createTradeImport(data: Record<string, any>, userId: string) {
    const importId = generateId('TIM');
    const records = data.records ?? [];
    const errors: any[] = [];
    let validCount = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec.security_id || !rec.quantity || !rec.trade_date) {
        errors.push({ row: i + 1, error: 'Missing required fields: security_id, quantity, trade_date' });
      } else {
        validCount++;
      }
    }

    const [imp] = await db.insert(schema.tradeImports).values({
      import_id: importId,
      file_name: data.file_name,
      import_date: new Date().toISOString().split('T')[0],
      imported_by: userId,
      total_records: records.length,
      valid_records: validCount,
      error_records: errors.length,
      import_status: errors.length === 0 ? 'VALIDATED' : 'ERRORS',
      validation_errors: errors.length > 0 ? errors : null,
      records,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return imp;
  },

  async getTradeImport(importId: string) {
    const [imp] = await db.select().from(schema.tradeImports)
      .where(eq(schema.tradeImports.import_id, importId)).limit(1);
    if (!imp) throw new NotFoundError(`Import ${importId} not found`);
    return imp;
  },

  async listTradeImports() {
    return db.select().from(schema.tradeImports)
      .where(eq(schema.tradeImports.is_deleted, false))
      .orderBy(desc(schema.tradeImports.import_date));
  },

  // OM-02: Switch orders — handled by adding SWITCH to order type enum
  // (The schema already has order types; we just need to ensure SWITCH is supported)

  // OM-03: Held-away asset booking — uses existing heldAwayAssets table
  async listHeldAwayAssets(portfolioId: string) {
    return db.select().from(schema.heldAwayAssets)
      .where(and(
        eq(schema.heldAwayAssets.portfolio_id, portfolioId),
        eq(schema.heldAwayAssets.is_deleted, false),
      ))
      .orderBy(desc(schema.heldAwayAssets.as_of_date));
  },

  async bookHeldAwayAsset(data: Record<string, any>, userId: string) {
    const [asset] = await db.insert(schema.heldAwayAssets).values({
      portfolio_id: data.portfolio_id,
      asset_class: data.asset_class ?? data.asset_type ?? 'EQUITY',
      description: data.description ?? data.security_id,
      custodian: data.custodian_name ?? data.custodian,
      location: data.location ?? data.custodian_account,
      market_value: data.market_value,
      currency: data.currency ?? 'PHP',
      as_of_date: data.valuation_date ?? new Date().toISOString().split('T')[0],
      created_by: userId,
      updated_by: userId,
    }).returning();
    return asset;
  },
};

// ─── Risk Management (RM-01, RM-02) ─────────────────────────────────────────

export const assetSwapService = {
  async listAssetSwaps(portfolioId?: string) {
    let conditions = [eq(schema.assetSwaps.is_deleted, false)];
    if (portfolioId) conditions.push(eq(schema.assetSwaps.portfolio_id, portfolioId));
    return db.select().from(schema.assetSwaps)
      .where(and(...conditions))
      .orderBy(desc(schema.assetSwaps.effective_date));
  },

  async createAssetSwap(data: Record<string, any>, userId: string) {
    const swapId = generateId('SWP');
    const [swap] = await db.insert(schema.assetSwaps).values({
      swap_id: swapId,
      ...data,
      swap_status: 'ACTIVE',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return swap;
  },

  async bookSwapFee(swapId: string, feeAmount: number, userId: string) {
    const [swap] = await db.select().from(schema.assetSwaps)
      .where(eq(schema.assetSwaps.swap_id, swapId)).limit(1);
    if (!swap) throw new NotFoundError(`Swap ${swapId} not found`);

    const currentFee = parseFloat(swap.trust_fee_booked ?? '0');
    const [updated] = await db.update(schema.assetSwaps)
      .set({
        trust_fee_booked: (currentFee + feeAmount).toFixed(4),
        last_fee_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.assetSwaps.swap_id, swapId))
      .returning();
    return updated;
  },

  async getUpcomingCoupons(daysAhead: number = 15) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    return db.select().from(schema.assetSwaps)
      .where(and(
        eq(schema.assetSwaps.is_deleted, false),
        eq(schema.assetSwaps.swap_status, 'ACTIVE'),
        lte(schema.assetSwaps.next_coupon_date, futureDate.toISOString().split('T')[0]),
      ))
      .orderBy(asc(schema.assetSwaps.next_coupon_date));
  },
};

// ─── Reporting & Analytics (RA-01, RA-02) ────────────────────────────────────

export const reportingService = {
  // RA-01: Covered Transaction Reporting
  async listCTRs(filters?: { status?: string; client_id?: string }) {
    let conditions = [eq(schema.coveredTransactionReports.is_deleted, false)];
    if (filters?.status) conditions.push(eq(schema.coveredTransactionReports.ctr_status, filters.status as any));
    if (filters?.client_id) conditions.push(eq(schema.coveredTransactionReports.client_id, filters.client_id));
    return db.select().from(schema.coveredTransactionReports)
      .where(and(...conditions))
      .orderBy(desc(schema.coveredTransactionReports.transaction_date));
  },

  async createCTR(data: Record<string, any>, userId: string) {
    const reportId = generateId('CTR');
    const amount = parseFloat(data.amount ?? '0');
    const threshold = parseFloat(data.threshold_amount ?? '500000');
    const [ctr] = await db.insert(schema.coveredTransactionReports).values({
      report_id: reportId,
      client_id: data.client_id,
      portfolio_id: data.portfolio_id,
      transaction_date: data.transaction_date,
      transaction_type: data.transaction_type,
      amount: amount.toFixed(4),
      currency: data.currency ?? 'PHP',
      threshold_amount: threshold.toFixed(4),
      is_above_threshold: amount >= threshold,
      related_transactions: data.related_transactions,
      ctr_status: 'DRAFT',
      narrative: data.narrative,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return ctr;
  },

  async fileCTR(reportId: string, userId: string) {
    const [updated] = await db.update(schema.coveredTransactionReports)
      .set({
        ctr_status: 'FILED',
        filed_date: new Date().toISOString().split('T')[0],
        filed_by: userId,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.coveredTransactionReports.report_id, reportId))
      .returning();
    if (!updated) throw new NotFoundError(`CTR ${reportId} not found`);
    return updated;
  },

  // RA-02: Escheat processing
  async listEscheatRecords(status?: string) {
    let conditions = [eq(schema.escheatRecords.is_deleted, false)];
    if (status) conditions.push(eq(schema.escheatRecords.escheat_status, status));
    return db.select().from(schema.escheatRecords)
      .where(and(...conditions))
      .orderBy(asc(schema.escheatRecords.escheat_eligible_date));
  },

  async createEscheatRecord(data: Record<string, any>, userId: string) {
    const escheatId = generateId('ESC');
    const [record] = await db.insert(schema.escheatRecords).values({
      escheat_id: escheatId,
      ...data,
      escheat_status: 'PENDING',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return record;
  },

  async fileEscheat(escheatId: string, reference: string, userId: string) {
    const [updated] = await db.update(schema.escheatRecords)
      .set({
        escheat_status: 'FILED',
        escheat_filed_date: new Date().toISOString().split('T')[0],
        government_reference: reference,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.escheatRecords.escheat_id, escheatId))
      .returning();
    if (!updated) throw new NotFoundError(`Escheat ${escheatId} not found`);
    return updated;
  },

  // GR-03: Report writer / templates
  async listReportTemplates(userId?: string) {
    return db.select().from(schema.reportTemplates)
      .where(eq(schema.reportTemplates.is_deleted, false))
      .orderBy(asc(schema.reportTemplates.template_name));
  },

  async createReportTemplate(data: Record<string, any>, userId: string) {
    const templateId = generateId('RPT');
    const [template] = await db.insert(schema.reportTemplates).values({
      template_id: templateId,
      template_name: data.template_name,
      description: data.description,
      report_type: data.report_type,
      query_definition: data.query_definition,
      columns: data.columns,
      filters: data.filters,
      calculations: data.calculations,
      sort_order: data.sort_order,
      grouping: data.grouping,
      output_format: data.output_format ?? 'XLSX',
      is_system: data.is_system ?? false,
      created_by_user: userId,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return template;
  },

  // GR-04/05: Report protection
  async listProtectedReports(clientId?: string) {
    let conditions = [eq(schema.reportProtection.is_deleted, false)];
    if (clientId) conditions.push(eq(schema.reportProtection.client_id, clientId));
    return db.select().from(schema.reportProtection)
      .where(and(...conditions))
      .orderBy(desc(schema.reportProtection.generated_date));
  },

  async createProtectedReport(data: Record<string, any>, userId: string) {
    const reportId = generateId('PRT');
    const [report] = await db.insert(schema.reportProtection).values({
      report_id: reportId,
      report_type: data.report_type,
      client_id: data.client_id,
      portfolio_id: data.portfolio_id,
      is_password_protected: data.is_password_protected ?? true,
      password_hint: data.password_hint,
      generated_date: new Date().toISOString().split('T')[0],
      generated_by: userId,
      file_reference: data.file_reference,
      delivery_method: data.delivery_method,
      created_by: userId,
      updated_by: userId,
    }).returning();
    return report;
  },

  // GR-01/02: Data migrations
  async listDataMigrations() {
    return db.select().from(schema.dataMigrations)
      .where(eq(schema.dataMigrations.is_deleted, false))
      .orderBy(desc(schema.dataMigrations.created_at));
  },

  async createDataMigration(data: Record<string, any>, userId: string) {
    const migrationId = generateId('MIG');
    const [migration] = await db.insert(schema.dataMigrations).values({
      migration_id: migrationId,
      migration_type: data.migration_type,
      source_system: data.source_system,
      description: data.description,
      total_records: data.total_records,
      migration_status: 'PENDING',
      created_by: userId,
      updated_by: userId,
    }).returning();
    return migration;
  },

  async updateMigrationProgress(migrationId: string, data: Record<string, any>, userId: string) {
    const [updated] = await db.update(schema.dataMigrations)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.dataMigrations.migration_id, migrationId))
      .returning();
    if (!updated) throw new NotFoundError(`Migration ${migrationId} not found`);
    return updated;
  },
};
