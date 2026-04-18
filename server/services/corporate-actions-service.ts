/**
 * Corporate Actions Service (Phase 3C)
 *
 * Manages corporate action lifecycle: ingestion, entitlement calculation,
 * election processing, tax treatment, and position/cash adjustments.
 *
 * Supports Philippine trust-specific CA types: dividends, splits, rights,
 * mergers, tenders, and bonus issues.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { cashLedgerService } from './cash-ledger-service';

export const corporateActionsService = {
  /** Ingest a new corporate action record */
  async ingestCorporateAction(data: {
    securityId: number;
    type: (typeof schema.corporateActionTypeEnum.enumValues)[number];
    exDate: string;
    recordDate: string;
    paymentDate?: string;
    ratio?: string;
    amountPerShare?: string;
    electionDeadline?: string;
    source?: string;
  }) {
    const [ca] = await db
      .insert(schema.corporateActions)
      .values({
        security_id: data.securityId,
        type: data.type,
        ex_date: data.exDate,
        record_date: data.recordDate,
        payment_date: data.paymentDate ?? null,
        ratio: data.ratio ?? null,
        amount_per_share: data.amountPerShare ?? null,
        election_deadline: data.electionDeadline ?? null,
        source: data.source ?? null,
        ca_status: 'ANNOUNCED',
      })
      .returning();

    return ca;
  },

  /** Calculate entitlement for a portfolio against a corporate action */
  async calculateEntitlement(caId: number, portfolioId: string) {
    // Get the corporate action
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, caId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${caId}`);
    }

    // Get the position for the portfolio + security
    const [position] = await db
      .select()
      .from(schema.positions)
      .where(
        and(
          eq(schema.positions.portfolio_id, portfolioId),
          eq(schema.positions.security_id, ca.security_id!),
        ),
      )
      .limit(1);

    if (!position) {
      throw new Error(
        `No position found for portfolio ${portfolioId} in security ${ca.security_id}`,
      );
    }

    const qty = parseFloat(position.quantity ?? '0');
    let entitledQty = 0;

    const caType = ca.type;

    if (caType === 'DIVIDEND_CASH' || caType === 'DIVIDEND_STOCK') {
      // Dividend: qty x amount_per_share
      const amountPerShare = parseFloat(ca.amount_per_share ?? '0');
      entitledQty = qty * amountPerShare;
    } else if (caType === 'SPLIT' || caType === 'REVERSE_SPLIT') {
      // Stock split: qty x ratio
      const ratio = parseFloat(ca.ratio ?? '1');
      entitledQty = qty * ratio;
    } else if (caType === 'RIGHTS' || caType === 'BONUS') {
      // Rights / Bonus: qty x ratio
      const ratio = parseFloat(ca.ratio ?? '0');
      entitledQty = qty * ratio;
    } else if (caType === 'TENDER' || caType === 'MERGER') {
      // Tender / Merger: full position qty is subject
      entitledQty = qty;
    }

    // Insert entitlement record
    const [entitlement] = await db
      .insert(schema.corporateActionEntitlements)
      .values({
        corporate_action_id: caId,
        portfolio_id: portfolioId,
        entitled_qty: String(entitledQty),
        elected_option: null,
        tax_treatment: null,
        posted: false,
      })
      .returning();

    return entitlement;
  },

  /** Process an election on an entitlement (CASH, REINVEST, TENDER, RIGHTS) */
  async processElection(entitlementId: number, option: string) {
    const validOptions = ['CASH', 'REINVEST', 'TENDER', 'RIGHTS'];
    if (!validOptions.includes(option)) {
      throw new Error(
        `Invalid election option: ${option}. Must be one of ${validOptions.join(', ')}`,
      );
    }

    const [updated] = await db
      .update(schema.corporateActionEntitlements)
      .set({
        elected_option: option,
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .returning();

    if (!updated) {
      throw new Error(`Entitlement not found: ${entitlementId}`);
    }

    return updated;
  },

  /** Apply tax treatment to an entitlement (WHT stub rates for PH) */
  async applyTaxTreatment(entitlementId: number) {
    const [entitlement] = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .limit(1);

    if (!entitlement) {
      throw new Error(`Entitlement not found: ${entitlementId}`);
    }

    // Stub tax rates: 25% WHT for resident, 30% WHT for non-resident
    // Default to resident rate
    const whtRate = 0.25;
    const treatment = `WHT_${(whtRate * 100).toFixed(0)}PCT`;

    const [updated] = await db
      .update(schema.corporateActionEntitlements)
      .set({
        tax_treatment: treatment,
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .returning();

    return updated;
  },

  /** Post CA adjustment: update position and/or cash based on election */
  async postCaAdjustment(entitlementId: number) {
    // Get entitlement
    const [entitlement] = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .limit(1);

    if (!entitlement) {
      throw new Error(`Entitlement not found: ${entitlementId}`);
    }

    if (entitlement.posted) {
      throw new Error(`Entitlement ${entitlementId} has already been posted`);
    }

    // Get the corporate action
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, entitlement.corporate_action_id!))
      .limit(1);

    if (!ca) {
      throw new Error(
        `Corporate action not found: ${entitlement.corporate_action_id}`,
      );
    }

    const portfolioId = entitlement.portfolio_id!;
    const entitledQty = parseFloat(entitlement.entitled_qty ?? '0');
    const electedOption = entitlement.elected_option ?? 'CASH';
    const caType = ca.type;

    // Apply tax deduction if applicable (dividends)
    let netAmount = entitledQty;
    if (
      (caType === 'DIVIDEND_CASH' || caType === 'DIVIDEND_STOCK') &&
      entitlement.tax_treatment
    ) {
      const taxMatch = entitlement.tax_treatment.match(/WHT_(\d+)PCT/);
      if (taxMatch) {
        const taxRate = parseInt(taxMatch[1], 10) / 100;
        netAmount = entitledQty * (1 - taxRate);
      }
    }

    if (caType === 'DIVIDEND_CASH' || caType === 'DIVIDEND_STOCK') {
      if (electedOption === 'CASH') {
        // Credit cash ledger
        await cashLedgerService.postEntry({
          portfolioId,
          type: 'CREDIT',
          amount: netAmount,
          currency: 'PHP',
          reference: `CA-DIV-${ca.id}-ENT-${entitlementId}`,
        });
      } else if (electedOption === 'REINVEST') {
        // Increase position quantity
        await db
          .update(schema.positions)
          .set({
            quantity: sql`(${schema.positions.quantity}::numeric + ${String(netAmount)})::text`,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.positions.portfolio_id, portfolioId),
              eq(schema.positions.security_id, ca.security_id!),
            ),
          );
      }
    } else if (caType === 'SPLIT' || caType === 'REVERSE_SPLIT') {
      // Adjust position quantity by ratio (entitled_qty is new total = old_qty * ratio)
      await db
        .update(schema.positions)
        .set({
          quantity: String(entitledQty),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.positions.portfolio_id, portfolioId),
            eq(schema.positions.security_id, ca.security_id!),
          ),
        );
    } else if (caType === 'RIGHTS' || caType === 'BONUS') {
      // Increase position quantity
      await db
        .update(schema.positions)
        .set({
          quantity: sql`(${schema.positions.quantity}::numeric + ${String(entitledQty)})::text`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.positions.portfolio_id, portfolioId),
            eq(schema.positions.security_id, ca.security_id!),
          ),
        );
    } else if (caType === 'TENDER') {
      if (electedOption === 'CASH') {
        // Credit cash, reduce position
        const amountPerShare = parseFloat(ca.amount_per_share ?? '0');
        const cashAmount = entitledQty * amountPerShare;
        await cashLedgerService.postEntry({
          portfolioId,
          type: 'CREDIT',
          amount: cashAmount,
          currency: 'PHP',
          reference: `CA-TENDER-${ca.id}-ENT-${entitlementId}`,
        });
        await db
          .update(schema.positions)
          .set({
            quantity: sql`(${schema.positions.quantity}::numeric - ${String(entitledQty)})::text`,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.positions.portfolio_id, portfolioId),
              eq(schema.positions.security_id, ca.security_id!),
            ),
          );
      }
    }

    // Mark entitlement as posted
    const [updated] = await db
      .update(schema.corporateActionEntitlements)
      .set({
        posted: true,
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .returning();

    return updated;
  },

  /** List corporate actions with optional filters */
  async getCorporateActions(filters: {
    status?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.status) {
      conditions.push(eq(schema.corporateActions.ca_status, filters.status));
    }

    if (filters.type) {
      conditions.push(
        eq(
          schema.corporateActions.type,
          filters.type as (typeof schema.corporateActionTypeEnum.enumValues)[number],
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.corporateActions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.corporateActions.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.corporateActions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get entitlements for a specific corporate action */
  async getEntitlements(caId: number) {
    const data = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.corporate_action_id, caId))
      .orderBy(desc(schema.corporateActionEntitlements.created_at));

    return data;
  },

  /** Get upcoming corporate actions (ex_date within N days from today) */
  async getUpcomingCAs(days?: number) {
    const lookAhead = days ?? 30;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + lookAhead);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const data = await db
      .select()
      .from(schema.corporateActions)
      .where(
        and(
          gte(schema.corporateActions.ex_date, todayStr),
          lte(schema.corporateActions.ex_date, futureDateStr),
        ),
      )
      .orderBy(schema.corporateActions.ex_date);

    return data;
  },
};
