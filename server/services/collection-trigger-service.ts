/**
 * Collection Trigger Service (TrustFees Pro -- Phase 9)
 *
 * Event-driven fee collection triggers that fire when corporate action
 * lifecycle events occur (dividend, maturity, pre-termination, redemption).
 *
 * Each handler:
 *   1. Finds OPEN accruals for the relevant portfolio/security
 *   2. Triggers immediate invoicing via tfpInvoiceService
 *   3. Returns summary of generated invoices
 *
 * Methods:
 *   - onCorporateAction(caEvent)      -- Dividend/coupon triggers
 *   - onMaturity(maturityEvent)       -- Bond/deposit maturity
 *   - onPreTermination(preTermEvent)  -- Early termination
 *   - onRedemptionViaSale(saleEvent)  -- Fund redemption or sale
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { tfpInvoiceService } from './tfp-invoice-service';

/* ---------- Types ---------- */

interface CorporateActionEvent {
  portfolio_id: string;
  security_id?: string;
  event_type: string; // DIVIDEND, COUPON, etc.
  event_date: string;
  amount?: number;
}

interface MaturityEvent {
  portfolio_id: string;
  security_id: string;
  maturity_date: string;
  face_value?: number;
}

interface PreTerminationEvent {
  portfolio_id: string;
  security_id?: string;
  termination_date: string;
  reason?: string;
}

interface RedemptionViaSaleEvent {
  portfolio_id: string;
  security_id?: string;
  sale_date: string;
  proceeds?: number;
}

/* ---------- Helpers ---------- */

/**
 * Find OPEN accruals for a given portfolio (and optionally security).
 * Returns the accrual IDs and the date range for invoicing.
 */
async function findOpenAccruals(portfolioId: string, securityId?: string) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(schema.tfpAccruals.accrual_status, 'OPEN'),
    eq(schema.tfpAccruals.portfolio_id, portfolioId),
  ];

  if (securityId) {
    conditions.push(eq(schema.tfpAccruals.security_id, securityId));
  }

  const accruals = await db
    .select()
    .from(schema.tfpAccruals)
    .where(and(...conditions));

  return accruals;
}

/**
 * Generate invoices for a set of accruals by finding the date range
 * and delegating to the invoice service.
 */
async function triggerInvoicing(accruals: Array<{ accrual_date: string }>, triggerType: string) {
  if (accruals.length === 0) {
    return {
      trigger_type: triggerType,
      invoices_created: 0,
      total_amount: 0,
      message: 'No OPEN accruals found for the given portfolio/security',
    };
  }

  // Get the date range from the accruals
  const dates = accruals.map((a) => a.accrual_date).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  const result = await tfpInvoiceService.generateInvoices(periodFrom, periodTo);

  return {
    trigger_type: triggerType,
    period_from: periodFrom,
    period_to: periodTo,
    accruals_found: accruals.length,
    ...result,
  };
}

/* ---------- Main Service ---------- */

export const collectionTriggerService = {
  /**
   * On corporate action event (dividend, coupon, etc.):
   * Find all OPEN accruals for the portfolio/security and generate immediate invoice.
   */
  async onCorporateAction(caEvent: CorporateActionEvent) {
    const accruals = await findOpenAccruals(caEvent.portfolio_id, caEvent.security_id);
    return triggerInvoicing(accruals, `CORPORATE_ACTION:${caEvent.event_type}`);
  },

  /**
   * On bond/deposit maturity:
   * Find all OPEN accruals for the portfolio/security and generate immediate invoice.
   */
  async onMaturity(maturityEvent: MaturityEvent) {
    const accruals = await findOpenAccruals(maturityEvent.portfolio_id, maturityEvent.security_id);
    return triggerInvoicing(accruals, 'MATURITY');
  },

  /**
   * On early termination:
   * Find all OPEN accruals for the portfolio and generate immediate invoice.
   */
  async onPreTermination(preTermEvent: PreTerminationEvent) {
    const accruals = await findOpenAccruals(preTermEvent.portfolio_id, preTermEvent.security_id);
    return triggerInvoicing(accruals, 'PRE_TERMINATION');
  },

  /**
   * On fund redemption or sale:
   * Find all OPEN accruals for the portfolio/security and generate immediate invoice.
   */
  async onRedemptionViaSale(saleEvent: RedemptionViaSaleEvent) {
    const accruals = await findOpenAccruals(saleEvent.portfolio_id, saleEvent.security_id);
    return triggerInvoicing(accruals, 'REDEMPTION_VIA_SALE');
  },
};
