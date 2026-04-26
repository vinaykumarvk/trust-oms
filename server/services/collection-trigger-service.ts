/**
 * Collection Trigger Service (TrustFees Pro — BRD Gap C12)
 *
 * Handles fee collection triggers on corporate actions, maturity,
 * pre-termination, and redemption-via-sale events.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { tfpAuditService } from './tfp-audit-service';

export const collectionTriggerService = {
  /**
   * Trigger fee collection on a corporate action event.
   * Finds applicable ACTIVE fee plans for the portfolio and creates
   * immediate invoiceable accruals.
   */
  async triggerOnCorporateAction(caId: number, portfolioId: string, feePlanId?: number) {
    const plans = await this.resolveApplicablePlans(portfolioId, 'EVENT', feePlanId);
    let created = 0;

    for (const plan of plans) {
      const idempotencyKey = `CT:CA:${caId}:${portfolioId}:${plan.id}`;
      const existing = await this.checkIdempotency(idempotencyKey);
      if (existing) continue;

      await this.createTriggerAccrual(plan, portfolioId, idempotencyKey, `Corporate action ${caId}`);
      created++;
    }

    await tfpAuditService.logEvent('COLLECTION_TRIGGER', String(caId), 'CA_TRIGGER_FIRED', { ca_id: caId, portfolio_id: portfolioId, accruals_created: created }, null);
    return { trigger_type: 'CORPORATE_ACTION', ca_id: caId, portfolio_id: portfolioId, accruals_created: created };
  },

  /**
   * Trigger fee collection on instrument maturity.
   */
  async triggerOnMaturity(securityId: string, portfolioId: string, maturityDate?: string) {
    const plans = await this.resolveApplicablePlans(portfolioId, 'EVENT');
    let created = 0;

    for (const plan of plans) {
      const idempotencyKey = `CT:MAT:${securityId}:${portfolioId}:${plan.id}`;
      const existing = await this.checkIdempotency(idempotencyKey);
      if (existing) continue;

      await this.createTriggerAccrual(plan, portfolioId, idempotencyKey, `Maturity ${securityId}`);
      created++;
    }

    await tfpAuditService.logEvent('COLLECTION_TRIGGER', securityId, 'MATURITY_TRIGGER_FIRED', { security_id: securityId, portfolio_id: portfolioId, accruals_created: created }, null);
    return { trigger_type: 'MATURITY', security_id: securityId, portfolio_id: portfolioId, accruals_created: created };
  },

  /**
   * Trigger fee collection on early termination.
   */
  async triggerOnPreTermination(accountId: string, portfolioId: string, terminationDate?: string) {
    const plans = await this.resolveApplicablePlans(portfolioId, 'EVENT');
    let created = 0;

    for (const plan of plans) {
      const idempotencyKey = `CT:PRETERM:${accountId}:${portfolioId}:${plan.id}`;
      const existing = await this.checkIdempotency(idempotencyKey);
      if (existing) continue;

      await this.createTriggerAccrual(plan, portfolioId, idempotencyKey, `Pre-termination ${accountId}`);
      created++;
    }

    await tfpAuditService.logEvent('COLLECTION_TRIGGER', accountId, 'PRETERMINATION_TRIGGER_FIRED', { account_id: accountId, portfolio_id: portfolioId, accruals_created: created }, null);
    return { trigger_type: 'PRE_TERMINATION', account_id: accountId, portfolio_id: portfolioId, accruals_created: created };
  },

  /**
   * Trigger fee collection on redemption via sale.
   */
  async triggerOnRedemptionViaSale(tradeId: string, portfolioId: string) {
    const plans = await this.resolveApplicablePlans(portfolioId, 'EVENT');
    let created = 0;

    for (const plan of plans) {
      const idempotencyKey = `CT:SALE:${tradeId}:${portfolioId}:${plan.id}`;
      const existing = await this.checkIdempotency(idempotencyKey);
      if (existing) continue;

      await this.createTriggerAccrual(plan, portfolioId, idempotencyKey, `Redemption via sale ${tradeId}`);
      created++;
    }

    await tfpAuditService.logEvent('COLLECTION_TRIGGER', tradeId, 'REDEMPTION_TRIGGER_FIRED', { trade_id: tradeId, portfolio_id: portfolioId, accruals_created: created }, null);
    return { trigger_type: 'REDEMPTION_VIA_SALE', trade_id: tradeId, portfolio_id: portfolioId, accruals_created: created };
  },

  /**
   * GAP-A10: Compute prorata fraction between CA date and accrual period.
   */
  computeProrata(caDate: string, periodStart: string, periodEnd: string): number {
    const ca = new Date(caDate).getTime();
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    if (totalDays <= 0) return 1;
    const elapsedDays = (ca - start) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(1, elapsedDays / totalDays));
  },

  /* ---------- Internal Helpers ---------- */

  async resolveApplicablePlans(portfolioId: string, chargeBasis: string, specificPlanId?: number) {
    const conditions = [
      eq(schema.feePlans.plan_status, 'ACTIVE'),
      eq(schema.feePlans.charge_basis, chargeBasis as any),
    ];
    if (specificPlanId) {
      conditions.push(eq(schema.feePlans.id, specificPlanId));
    }
    return db.select().from(schema.feePlans).where(and(...conditions));
  },

  async checkIdempotency(key: string): Promise<boolean> {
    const [existing] = await db
      .select({ id: schema.tfpAccruals.id })
      .from(schema.tfpAccruals)
      .where(eq(schema.tfpAccruals.idempotency_key, key))
      .limit(1);
    return !!existing;
  },

  async createTriggerAccrual(plan: any, portfolioId: string, idempotencyKey: string, description: string) {
    const today = new Date().toISOString().split('T')[0];

    // Resolve customer from portfolio
    const [portfolio] = await db
      .select({ client_id: schema.portfolios.client_id })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    const customerId = portfolio?.client_id ?? 'UNKNOWN';

    // Use min_charge_amount as the event fee amount, or 0
    const feeAmount = parseFloat(plan.min_charge_amount ?? '0');

    await db.insert(schema.tfpAccruals).values({
      fee_plan_id: plan.id,
      customer_id: customerId,
      portfolio_id: portfolioId,
      security_id: null,
      transaction_id: null,
      base_amount: String(feeAmount),
      computed_fee: String(feeAmount),
      applied_fee: String(feeAmount),
      currency: 'PHP',
      fx_rate_locked: null,
      accrual_date: today,
      accrual_status: 'OPEN',
      override_id: null,
      exception_id: null,
      idempotency_key: idempotencyKey,
    });
  },
};
