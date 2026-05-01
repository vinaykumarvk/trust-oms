/**
 * Gap Closure Service — Non-GL P1/P2/P3 gaps from consolidated gap register
 *
 * Implements:
 *   TFP-REVERSE: Manual fee reversal endpoint
 *   TFP-TER: UITF TER historical persistence
 *   TFP-GL-BRIDGE: Auto-bridge TFP accruals → GL posting in EOD
 *   FR-FEE-003p: Fee invoice GL posting
 *   FR-AUT-004: Edit re-triggers authorization (reset approvals)
 *   FR-EXE-011: Daily broker charge distribution batch
 *   FR-WDL-007: Income-first withdrawal hierarchy
 *   FR-CSH-001p: Nostro/Vostro daily reconciliation
 *   FR-CSH-002p: FX deal capture
 *   FR-TAX-003p: FATCA/CRS IDES XML envelope
 *   SR-007: Knowledge base CRUD
 *   SR-003: SLA breach escalation
 *   SR-004: Sub-task table CRUD
 *   SR-010: Client notification on SR status changes
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, gte, lte, asc, lt } from 'drizzle-orm';

function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// TFP-TER: UITF TER Historical Persistence
// ─────────────────────────────────────────────────────────────────────────────

export const uitfTerService = {
  async computeAndStore(fundId: number, period: string, userId: number) {
    // Get fee batches for the period
    const [year, monthOrQ] = period.split('-');
    let startDate: string;
    let endDate: string;
    if (monthOrQ.startsWith('Q')) {
      const q = parseInt(monthOrQ.substring(1));
      startDate = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
      const endMonth = q * 3;
      endDate = new Date(parseInt(year), endMonth, 0).toISOString().split('T')[0];
    } else {
      startDate = `${year}-${monthOrQ}-01`;
      endDate = new Date(parseInt(year), parseInt(monthOrQ), 0).toISOString().split('T')[0];
    }

    // Sum fees from GL
    const feeBatches = await db.select().from(schema.glJournalBatches).where(and(
      sql`${schema.glJournalBatches.source_system} = 'TFP_FEES'`,
      eq(schema.glJournalBatches.fund_id, fundId),
      gte(schema.glJournalBatches.transaction_date, startDate),
      lte(schema.glJournalBatches.transaction_date, endDate),
      eq(schema.glJournalBatches.batch_status, 'POSTED'),
    ));

    const totalExpenses = feeBatches.reduce((sum: number, b: any) => sum + toNum(b.total_debit), 0);

    // Average NAV for period
    const navComps = await db.select().from(schema.glNavComputations).where(and(
      eq(schema.glNavComputations.fund_id, fundId),
      gte(schema.glNavComputations.nav_date, startDate),
      lte(schema.glNavComputations.nav_date, endDate),
      eq(schema.glNavComputations.nav_status, 'FINAL'),
    ));

    const avgNav = navComps.length > 0
      ? navComps.reduce((sum: number, n: any) => sum + toNum(n.net_nav), 0) / navComps.length
      : 0;

    const terPct = avgNav > 0 ? (totalExpenses / avgNav) * 100 : 0;

    const breakdown: Record<string, number> = {};
    for (const b of feeBatches) {
      const type = b.event_code ?? 'OTHER';
      breakdown[type] = (breakdown[type] ?? 0) + toNum(b.total_debit);
    }

    const [record] = await db.insert(schema.uitfTerHistory).values({
      fund_id: fundId,
      period,
      total_expenses: String(totalExpenses),
      average_nav: String(avgNav),
      ter_pct: String(terPct.toFixed(4)),
      breakdown,
      computed_by: userId,
      created_by: String(userId),
      updated_by: String(userId),
    }).returning();

    return record;
  },

  async getHistory(fundId: number) {
    return db.select().from(schema.uitfTerHistory)
      .where(eq(schema.uitfTerHistory.fund_id, fundId))
      .orderBy(desc(schema.uitfTerHistory.period));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TFP-GL-BRIDGE + FR-FEE-003p: Auto-bridge TFP accruals → GL in EOD
// ─────────────────────────────────────────────────────────────────────────────

export const tfpGlBridgeService = {
  async bridgeAccrualsToGl(businessDate: string, userId: number) {
    // Find unbridged TFP accruals
    const accruals = await db.select().from(schema.tfpAccruals).where(and(
      eq(schema.tfpAccruals.accrual_status, 'ACCOUNTED'),
      lte(schema.tfpAccruals.accrual_date, businessDate),
    ));

    let bridged = 0;
    const errors: string[] = [];

    // Lazy-import to avoid circular dependency
    const { glAccrualService } = await import('./gl-accrual-service');

    for (const accrual of accruals) {
      try {
        const result = await glAccrualService.postFeeToGl({
          feeType: accrual.fee_type ?? 'TRUST_FEE',
          amount: toNum(accrual.accrual_amount),
          fundId: accrual.fund_id ?? undefined,
          feeGlDr: 'FEE-EXPENSE',
          feeGlCr: 'FEE-PAYABLE',
          businessDate,
          userId,
          narration: `TFP accrual bridge: ${accrual.id}`,
        });
        if (result.posted) bridged++;
      } catch (err) {
        errors.push(`Accrual ${accrual.id}: ${(err as Error).message}`);
      }
    }

    return { total_accruals: accruals.length, bridged, errors };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TFP-REVERSE: Manual fee reversal endpoint
// ─────────────────────────────────────────────────────────────────────────────

export const tfpManualReversalService = {
  async reverseInvoice(invoiceId: number, reason: string, userId: string) {
    const [invoice] = await db.select().from(schema.tfpInvoices)
      .where(eq(schema.tfpInvoices.id, invoiceId)).limit(1);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.invoice_status === 'REVERSED') throw new Error('Invoice already reversed');

    const [reversed] = await db.update(schema.tfpInvoices).set({
      invoice_status: 'REVERSED' as any,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.tfpInvoices.id, invoiceId)).returning();

    return { reversed: true, invoice: reversed, reason };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-AUT-004: Edit re-triggers authorization (reset approvals)
// ─────────────────────────────────────────────────────────────────────────────

export const orderAuthResetService = {
  async resetOnEdit(orderId: string, userId: string) {
    const [order] = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order) throw new Error('Order not found');

    // Only reset if in PENDING_AUTH or AUTHORIZED status
    if (!['PENDING_AUTH', 'AUTHORIZED'].includes(order.order_status)) {
      throw new Error(`Cannot reset approvals for order in ${order.order_status} status`);
    }

    const [updated] = await db.update(schema.orders).set({
      order_status: 'DRAFT',
      authorized_by: null,
      authorized_at: null,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.orders.order_id, orderId)).returning();

    return { reset: true, order: updated };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-EXE-011: Daily Broker Charge Distribution Batch
// ─────────────────────────────────────────────────────────────────────────────

export const brokerChargeService = {
  async distributeDailyCharges(businessDate: string) {
    // Get filled orders for the date
    const filledOrders = await db.select().from(schema.orders).where(and(
      eq(schema.orders.value_date, businessDate),
      sql`${schema.orders.order_status} IN ('FILLED', 'PARTIALLY_FILLED')`,
    ));

    const brokerCharges: Record<string, { broker_id: number; total_commission: number; order_count: number }> = {};

    for (const order of filledOrders) {
      const brokerId = order.broker_id ?? 0;
      const key = String(brokerId);
      if (!brokerCharges[key]) {
        brokerCharges[key] = { broker_id: brokerId, total_commission: 0, order_count: 0 };
      }
      brokerCharges[key].total_commission += toNum(order.commission);
      brokerCharges[key].order_count++;
    }

    return {
      business_date: businessDate,
      total_orders: filledOrders.length,
      broker_summary: Object.values(brokerCharges),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-WDL-007: Income-first withdrawal hierarchy
// ─────────────────────────────────────────────────────────────────────────────

export const withdrawalHierarchyService = {
  async computeHierarchy(portfolioId: string, amount: number) {
    // Get income balance
    const incomeBalances = await db.select().from(schema.glLedgerBalances).where(and(
      sql`${schema.glLedgerBalances.portfolio_id}::text = ${portfolioId}`,
    ));

    const incomeGls = incomeBalances.filter((b: any) => {
      // Income GLs typically have positive credit balance
      return toNum(b.closing_balance) > 0;
    });

    const totalIncome = incomeGls.reduce((sum: number, b: any) => sum + Math.abs(toNum(b.closing_balance)), 0);

    let remaining = amount;
    const hierarchy: Array<{ source: string; amount: number }> = [];

    // Income first
    if (totalIncome > 0) {
      const fromIncome = Math.min(remaining, totalIncome);
      hierarchy.push({ source: 'INCOME', amount: fromIncome });
      remaining -= fromIncome;
    }

    // Then principal
    if (remaining > 0) {
      hierarchy.push({ source: 'PRINCIPAL', amount: remaining });
    }

    return {
      portfolio_id: portfolioId,
      requested_amount: amount,
      available_income: totalIncome,
      hierarchy,
      tax_implications: hierarchy.filter(h => h.source === 'INCOME').length > 0
        ? 'Income portion may be subject to withholding tax'
        : 'Principal withdrawal — no income tax',
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-CSH-001p: Nostro/Vostro Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

export const nostroReconService = {
  async runDailyRecon(glHeadId: number, reconDate: string, bankBalance: number, userId: number) {
    // Get book balance from GL
    const [balance] = await db.select().from(schema.glLedgerBalances).where(and(
      eq(schema.glLedgerBalances.gl_head_id, glHeadId),
      eq(schema.glLedgerBalances.balance_date, reconDate),
    )).limit(1);

    const bookBalance = toNum(balance?.closing_balance);
    const difference = bookBalance - bankBalance;

    const [record] = await db.insert(schema.nostroReconciliations).values({
      gl_head_id: glHeadId,
      recon_date: reconDate,
      book_balance: String(bookBalance),
      bank_balance: String(bankBalance),
      difference: String(difference),
      recon_status: Math.abs(difference) < 0.01 ? 'MATCHED' : 'EXCEPTION',
      reconciled_by: userId,
      reconciled_at: new Date(),
      created_by: String(userId),
      updated_by: String(userId),
    }).returning();

    return record;
  },

  async listRecons(glHeadId?: number, dateFrom?: string, dateTo?: string) {
    const conditions = [];
    if (glHeadId) conditions.push(eq(schema.nostroReconciliations.gl_head_id, glHeadId));
    if (dateFrom) conditions.push(gte(schema.nostroReconciliations.recon_date, dateFrom));
    if (dateTo) conditions.push(lte(schema.nostroReconciliations.recon_date, dateTo));

    const query = db.select().from(schema.nostroReconciliations);
    return conditions.length > 0
      ? query.where(and(...conditions)).orderBy(desc(schema.nostroReconciliations.recon_date))
      : query.orderBy(desc(schema.nostroReconciliations.recon_date));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-CSH-002p: FX Deal Capture
// ─────────────────────────────────────────────────────────────────────────────

export const fxDealService = {
  async create(data: {
    deal_type: string;
    buy_currency: string;
    sell_currency: string;
    buy_amount: string;
    sell_amount: string;
    exchange_rate: string;
    toap_rate?: string;
    value_date: string;
    maturity_date?: string;
    counterparty_id?: number;
    portfolio_id?: string;
    userId: string;
  }) {
    const ref = `FX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const [record] = await db.insert(schema.fxDeals).values({
      deal_reference: ref,
      deal_type: data.deal_type,
      buy_currency: data.buy_currency,
      sell_currency: data.sell_currency,
      buy_amount: data.buy_amount,
      sell_amount: data.sell_amount,
      exchange_rate: data.exchange_rate,
      toap_rate: data.toap_rate ?? null,
      value_date: data.value_date,
      maturity_date: data.maturity_date ?? null,
      counterparty_id: data.counterparty_id ?? null,
      portfolio_id: data.portfolio_id ?? null,
      deal_status: 'PENDING',
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async list(filters?: { portfolio_id?: string; deal_type?: string; status?: string }) {
    const conditions = [];
    if (filters?.portfolio_id) conditions.push(eq(schema.fxDeals.portfolio_id, filters.portfolio_id));
    if (filters?.deal_type) conditions.push(eq(schema.fxDeals.deal_type, filters.deal_type));
    if (filters?.status) conditions.push(eq(schema.fxDeals.deal_status, filters.status));

    const query = db.select().from(schema.fxDeals);
    return conditions.length > 0
      ? query.where(and(...conditions)).orderBy(desc(schema.fxDeals.id))
      : query.orderBy(desc(schema.fxDeals.id));
  },

  async confirm(id: number, userId: string) {
    const [record] = await db.update(schema.fxDeals).set({
      deal_status: 'CONFIRMED',
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.fxDeals.id, id)).returning();
    return record;
  },

  async settle(id: number, settlementRef: string, userId: string) {
    const [record] = await db.update(schema.fxDeals).set({
      deal_status: 'SETTLED',
      settlement_reference: settlementRef,
      updated_by: userId,
      updated_at: new Date(),
    }).where(eq(schema.fxDeals.id, id)).returning();
    return record;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FR-TAX-003p: FATCA/CRS IDES XML envelope
// ─────────────────────────────────────────────────────────────────────────────

export const fatcaIdesService = {
  generateIdesXml(reportingPeriod: string, data: {
    reporting_fi: { name: string; giin: string; country: string };
    accounts: Array<{
      account_number: string;
      account_holder: string;
      tin: string;
      country: string;
      balance: number;
      income: number;
    }>;
  }): string {
    const accounts = data.accounts.map(a => `
    <AccountReport>
      <AccountNumber>${escapeXml(a.account_number)}</AccountNumber>
      <AccountHolder>
        <Name>${escapeXml(a.account_holder)}</Name>
        <TIN issuedBy="${escapeXml(a.country)}">${escapeXml(a.tin)}</TIN>
        <ResCountryCode>${escapeXml(a.country)}</ResCountryCode>
      </AccountHolder>
      <AccountBalance currCode="PHP">${a.balance.toFixed(2)}</AccountBalance>
      <Payment>
        <Type>CRS502</Type>
        <PaymentAmnt currCode="PHP">${a.income.toFixed(2)}</PaymentAmnt>
      </Payment>
    </AccountReport>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<CrsBody version="2.0">
  <ReportingFI>
    <Name>${escapeXml(data.reporting_fi.name)}</Name>
    <GIIN>${escapeXml(data.reporting_fi.giin)}</GIIN>
    <ResCountryCode>${escapeXml(data.reporting_fi.country)}</ResCountryCode>
  </ReportingFI>
  <ReportingPeriod>${escapeXml(reportingPeriod)}</ReportingPeriod>
  <AccountReports>${accounts}
  </AccountReports>
</CrsBody>`;
  },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ─────────────────────────────────────────────────────────────────────────────
// SR-007: Knowledge Base CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const knowledgeBaseService = {
  async create(data: {
    title: string;
    category: string;
    content: string;
    tags?: string[];
    userId: string;
  }) {
    const [record] = await db.insert(schema.knowledgeBase).values({
      title: data.title,
      category: data.category,
      content: data.content,
      tags: data.tags ?? [],
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async list(category?: string, search?: string) {
    const conditions = [eq(schema.knowledgeBase.is_published, true)];
    if (category) conditions.push(eq(schema.knowledgeBase.category, category));
    if (search) {
      conditions.push(sql`(${schema.knowledgeBase.title} ILIKE ${'%' + search + '%'} OR ${schema.knowledgeBase.content} ILIKE ${'%' + search + '%'})`);
    }
    return db.select().from(schema.knowledgeBase).where(and(...conditions)).orderBy(desc(schema.knowledgeBase.id));
  },

  async getById(id: number) {
    // Increment view count
    await db.update(schema.knowledgeBase).set({
      view_count: sql`${schema.knowledgeBase.view_count} + 1`,
    }).where(eq(schema.knowledgeBase.id, id));

    const [record] = await db.select().from(schema.knowledgeBase)
      .where(eq(schema.knowledgeBase.id, id)).limit(1);
    return record ?? null;
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const [record] = await db.update(schema.knowledgeBase)
      .set({ ...data, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.knowledgeBase.id, id)).returning();
    return record;
  },

  async markHelpful(id: number) {
    const [record] = await db.update(schema.knowledgeBase).set({
      helpful_count: sql`${schema.knowledgeBase.helpful_count} + 1`,
    }).where(eq(schema.knowledgeBase.id, id)).returning();
    return record;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SR-004: Sub-task CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const srTaskService = {
  async create(data: {
    sr_id: number;
    task_title: string;
    task_description?: string;
    assigned_to?: number;
    due_date?: string;
    userId: string;
  }) {
    const [record] = await db.insert(schema.srTasks).values({
      sr_id: data.sr_id,
      task_title: data.task_title,
      task_description: data.task_description ?? null,
      assigned_to: data.assigned_to ?? null,
      due_date: data.due_date ? new Date(data.due_date) : null,
      created_by: data.userId,
      updated_by: data.userId,
    }).returning();
    return record;
  },

  async listBySr(srId: number) {
    return db.select().from(schema.srTasks)
      .where(eq(schema.srTasks.sr_id, srId))
      .orderBy(asc(schema.srTasks.sort_order));
  },

  async update(id: number, data: Record<string, unknown>, userId: string) {
    const updates: Record<string, unknown> = { ...data, updated_by: userId, updated_at: new Date() };
    if (data.task_status === 'COMPLETED') {
      updates.completed_at = new Date();
    }
    const [record] = await db.update(schema.srTasks)
      .set(updates)
      .where(eq(schema.srTasks.id, id)).returning();
    return record;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SR-003: SLA Breach Escalation
// ─────────────────────────────────────────────────────────────────────────────

export const srEscalationService = {
  async checkBreaches() {
    const now = new Date();
    const breached = await db.select().from(schema.serviceRequests).where(and(
      sql`${schema.serviceRequests.sr_status} NOT IN ('CLOSED', 'REJECTED')`,
      eq(schema.serviceRequests.is_deleted, false),
      lt(schema.serviceRequests.appointed_end_date, now),
    ));

    const escalations = breached.map((sr: any) => ({
      sr_id: sr.id,
      request_id: sr.request_id,
      priority: sr.priority,
      appointed_end: sr.appointed_end_date,
      breach_hours: Math.round((now.getTime() - (sr.appointed_end_date?.getTime() ?? now.getTime())) / 3600000),
    }));

    // Update priority for severely breached items
    for (const esc of escalations) {
      if (esc.breach_hours > 48 && esc.priority !== 'CRITICAL') {
        await db.update(schema.serviceRequests).set({
          priority: 'CRITICAL',
          updated_at: new Date(),
          updated_by: 'SYSTEM',
        }).where(eq(schema.serviceRequests.id, esc.sr_id));
      }
    }

    return { total_breached: breached.length, escalations };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SR-010: Client Notification on SR Status Changes
// ─────────────────────────────────────────────────────────────────────────────

export const srNotificationService = {
  async notifyStatusChange(srId: number, newStatus: string, userId: string) {
    const [sr] = await db.select().from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.id, srId)).limit(1);
    if (!sr) return null;

    // Create a client message notification
    const [message] = await db.insert(schema.clientMessages).values({
      sender_id: parseInt(userId) || 1,
      sender_type: 'BO_USER',
      recipient_client_id: sr.client_id,
      subject: `Service Request ${sr.request_id} — Status Update`,
      body: `Your service request ${sr.request_id} has been updated to: ${newStatus}.\n\nDetails: ${sr.sr_details ?? 'N/A'}`,
      related_sr_id: srId,
      created_by: userId,
      updated_by: userId,
    }).returning();

    return message;
  },
};
