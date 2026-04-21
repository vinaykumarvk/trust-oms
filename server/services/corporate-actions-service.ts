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
import { marketCalendarService } from './market-calendar-service';
import { taxEngineService } from './tax-engine-service';

// Status progression order for lifecycle validation
const STATUS_ORDER = ['ANNOUNCED', 'SCRUBBED', 'GOLDEN_COPY', 'ENTITLED', 'ELECTED', 'SETTLED'] as const;

// CA types that are purely informational (no financial entitlement)
const INFORMATIONAL_TYPES = [
  'NAME_CHANGE', 'ISIN_CHANGE', 'TICKER_CHANGE', 'PAR_VALUE_CHANGE',
  'SECURITY_RECLASSIFICATION', 'PROXY_VOTE', 'CLASS_ACTION',
] as const;

export const corporateActionsService = {
  /** Ingest a new corporate action record with optional calendar validation */
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
    calendarKey?: string;
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

    // Validate dates against market calendar
    const calKey = data.calendarKey ?? 'PH';
    const dateValidation = await marketCalendarService.validateCADates(
      calKey,
      data.exDate,
      data.recordDate,
      data.paymentDate,
    );

    return { ...ca, dateValidation };
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
    const amountPerShare = parseFloat(ca.amount_per_share ?? '0');
    const ratio = parseFloat(ca.ratio ?? '0');

    if (caType === 'DIVIDEND_CASH' || caType === 'DIVIDEND_STOCK' || caType === 'DIVIDEND_WITH_OPTION') {
      // Dividend: qty x amount_per_share
      entitledQty = qty * amountPerShare;
    } else if (caType === 'SPLIT' || caType === 'REVERSE_SPLIT' || caType === 'CONSOLIDATION') {
      // Stock split / consolidation: qty x ratio
      const splitRatio = parseFloat(ca.ratio ?? '1');
      entitledQty = qty * splitRatio;
    } else if (caType === 'RIGHTS' || caType === 'BONUS' || caType === 'BONUS_ISSUE') {
      // Rights / Bonus: qty x ratio
      entitledQty = qty * ratio;
    } else if (caType === 'TENDER' || caType === 'MERGER') {
      // Tender / Merger: full position qty is subject
      entitledQty = qty;
    } else if (caType === 'COUPON') {
      // COUPON: face_value x coupon_rate (amount_per_share as coupon_rate proxy)
      entitledQty = qty * amountPerShare;
    } else if (caType === 'PARTIAL_REDEMPTION') {
      // PARTIAL_REDEMPTION: qty x ratio (ratio = redemption percentage)
      entitledQty = qty * ratio;
    } else if (caType === 'FULL_REDEMPTION' || caType === 'MATURITY') {
      // FULL_REDEMPTION, MATURITY: qty x amount_per_share (face value)
      entitledQty = qty * amountPerShare;
    } else if (caType === 'CAPITAL_DISTRIBUTION' || caType === 'CAPITAL_GAINS_DISTRIBUTION' || caType === 'RETURN_OF_CAPITAL') {
      // Cash distribution types: qty x amount_per_share
      entitledQty = qty * amountPerShare;
    } else if (caType === 'SPINOFF_WITH_OPTION') {
      // SPINOFF_WITH_OPTION: qty x ratio (new security allocation)
      entitledQty = qty * ratio;
    } else if (caType === 'BUYBACK' || caType === 'DUTCH_AUCTION' || caType === 'EXCHANGE_OFFER') {
      // Buyback / Auction / Exchange: qty x amount_per_share (tender price)
      entitledQty = qty * amountPerShare;
    } else if (caType === 'WARRANT_EXERCISE' || caType === 'CONVERSION') {
      // Warrant / Conversion: qty x ratio
      entitledQty = qty * ratio;
    } else if (caType === 'MERGER_WITH_ELECTION') {
      // Merger with election: full position qty is subject
      entitledQty = qty;
    } else if (
      (INFORMATIONAL_TYPES as readonly string[]).includes(caType ?? '')
    ) {
      // Informational CA types — no financial entitlement
      entitledQty = 0;
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

  /** Apply tax treatment to an entitlement — delegates to taxEngineService.calculateCAWHT() */
  async applyTaxTreatment(entitlementId: number) {
    const result = await taxEngineService.calculateCAWHT(entitlementId);

    const treatment = `WHT_${(result.rate * 100).toFixed(0)}PCT_${result.rateType}`;

    const [updated] = await db
      .update(schema.corporateActionEntitlements)
      .set({
        tax_treatment: treatment,
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .returning();

    return { ...updated, taxResult: result };
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

    // ---- Phase 5: WHT calculation via tax engine for dividend-like CA types ----
    const taxableCaTypes = [
      'DIVIDEND_CASH', 'DIVIDEND_STOCK', 'DIVIDEND_WITH_OPTION',
      'COUPON', 'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION',
    ];
    let caWhtResult: { taxAmount: number; rate: number; rateType: 'TREATY' | 'STATUTORY'; ttraId?: string } | null = null;

    if (taxableCaTypes.includes(caType ?? '')) {
      try {
        caWhtResult = await taxEngineService.calculateCAWHT(entitlementId);
      } catch (err: unknown) {
        // Log but do not block posting if tax calculation fails
        console.error(`[CA-WHT] Tax calculation failed for entitlement ${entitlementId}:`, err);
      }
    }

    // Mark entitlement as posted
    const [updated] = await db
      .update(schema.corporateActionEntitlements)
      .set({
        posted: true,
        tax_treatment: caWhtResult
          ? `WHT_${(caWhtResult.rate * 100).toFixed(0)}PCT_${caWhtResult.rateType}`
          : entitlement.tax_treatment,
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .returning();

    // Check if ALL entitlements for this CA are now posted; if so, mark CA as SETTLED
    const allEntitlements = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.corporate_action_id, entitlement.corporate_action_id!));

    const allPosted = allEntitlements.length > 0 && allEntitlements.every(
      (ent: typeof allEntitlements[number]) => ent.posted === true,
    );

    if (allPosted) {
      await db
        .update(schema.corporateActions)
        .set({
          ca_status: 'SETTLED',
          updated_at: new Date(),
        })
        .where(eq(schema.corporateActions.id, entitlement.corporate_action_id!));
    }

    return updated;
  },

  /** Scrub a corporate action — validate key fields and cross-reference security */
  async scrubEvent(caId: number) {
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, caId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${caId}`);
    }

    // Validate status — must be ANNOUNCED to scrub
    const currentIdx = STATUS_ORDER.indexOf(ca.ca_status as typeof STATUS_ORDER[number]);
    const scrubIdx = STATUS_ORDER.indexOf('SCRUBBED');
    if (currentIdx >= scrubIdx) {
      throw new Error(`Cannot scrub CA ${caId}: already at status '${ca.ca_status}' (past SCRUBBED)`);
    }

    // Validate required fields
    if (!ca.security_id) {
      throw new Error(`Cannot scrub CA ${caId}: security_id is missing`);
    }
    if (!ca.ex_date) {
      throw new Error(`Cannot scrub CA ${caId}: ex_date is missing`);
    }
    if (!ca.record_date) {
      throw new Error(`Cannot scrub CA ${caId}: record_date is missing`);
    }

    // Cross-reference: verify security exists in the securities table
    const [security] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.id, ca.security_id))
      .limit(1);

    if (!security) {
      throw new Error(`Cannot scrub CA ${caId}: security with id ${ca.security_id} not found in securities table`);
    }

    // Update status to SCRUBBED
    const [updated] = await db
      .update(schema.corporateActions)
      .set({
        ca_status: 'SCRUBBED',
        scrub_status: 'PASSED',
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActions.id, caId))
      .returning();

    return updated;
  },

  /** Mark a scrubbed CA as golden copy */
  async goldenCopy(caId: number) {
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, caId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${caId}`);
    }

    // Must be in SCRUBBED status
    if (ca.ca_status !== 'SCRUBBED') {
      throw new Error(`Cannot promote CA ${caId} to GOLDEN_COPY: current status is '${ca.ca_status}', must be 'SCRUBBED'`);
    }

    const [updated] = await db
      .update(schema.corporateActions)
      .set({
        ca_status: 'GOLDEN_COPY',
        golden_copy_source: 'INTERNAL',
        updated_at: new Date(),
      })
      .where(eq(schema.corporateActions.id, caId))
      .returning();

    return updated;
  },

  /** Simulate entitlement for a portfolio without persisting to DB */
  async simulateEntitlement(caId: number, portfolioId: string) {
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
    const amountPerShare = parseFloat(ca.amount_per_share ?? '0');
    const ratio = parseFloat(ca.ratio ?? '0');

    if (caType === 'DIVIDEND_CASH' || caType === 'DIVIDEND_STOCK' || caType === 'DIVIDEND_WITH_OPTION') {
      entitledQty = qty * amountPerShare;
    } else if (caType === 'SPLIT' || caType === 'REVERSE_SPLIT' || caType === 'CONSOLIDATION') {
      const splitRatio = parseFloat(ca.ratio ?? '1');
      entitledQty = qty * splitRatio;
    } else if (caType === 'RIGHTS' || caType === 'BONUS' || caType === 'BONUS_ISSUE') {
      entitledQty = qty * ratio;
    } else if (caType === 'TENDER' || caType === 'MERGER' || caType === 'MERGER_WITH_ELECTION') {
      entitledQty = qty;
    } else if (caType === 'COUPON') {
      entitledQty = qty * amountPerShare;
    } else if (caType === 'PARTIAL_REDEMPTION') {
      entitledQty = qty * ratio;
    } else if (caType === 'FULL_REDEMPTION' || caType === 'MATURITY') {
      entitledQty = qty * amountPerShare;
    } else if (caType === 'CAPITAL_DISTRIBUTION' || caType === 'CAPITAL_GAINS_DISTRIBUTION' || caType === 'RETURN_OF_CAPITAL') {
      entitledQty = qty * amountPerShare;
    } else if (caType === 'SPINOFF_WITH_OPTION') {
      entitledQty = qty * ratio;
    } else if (caType === 'BUYBACK' || caType === 'DUTCH_AUCTION' || caType === 'EXCHANGE_OFFER') {
      entitledQty = qty * amountPerShare;
    } else if (caType === 'WARRANT_EXERCISE' || caType === 'CONVERSION') {
      entitledQty = qty * ratio;
    } else if (
      (INFORMATIONAL_TYPES as readonly string[]).includes(caType ?? '')
    ) {
      entitledQty = 0;
    }

    // Estimate WHT (25% resident default rate)
    const whtRate = 0.25;
    const isDividendLike = ['DIVIDEND_CASH', 'DIVIDEND_STOCK', 'DIVIDEND_WITH_OPTION', 'COUPON',
      'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION', 'RETURN_OF_CAPITAL'].includes(caType ?? '');
    const estimatedTax = isDividendLike ? entitledQty * whtRate : 0;
    const netAmount = entitledQty - estimatedTax;

    return {
      corporate_action_id: caId,
      portfolio_id: portfolioId,
      security_id: ca.security_id,
      ca_type: ca.type,
      position_qty: qty,
      entitled_qty: entitledQty,
      estimated_tax: estimatedTax,
      net_amount: netAmount,
      simulation: true,
    };
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

  /** Get corporate actions summary stats */
  async getSummary() {
    const allCAs = await db.select().from(schema.corporateActions).where(eq(schema.corporateActions.is_deleted, false));
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];

    const pending = allCAs.filter((ca: typeof allCAs[number]) => ca.ca_status === 'ANNOUNCED' || ca.ca_status === 'SCRUBBED');
    const upcoming = allCAs.filter((ca: typeof allCAs[number]) => ca.ex_date && ca.ex_date >= today && ca.ex_date <= thirtyDaysOut.toISOString().split('T')[0]);
    const processedToday = allCAs.filter((ca: typeof allCAs[number]) => ca.updated_at && ca.updated_at.toISOString().split('T')[0] === today && ca.ca_status === 'SETTLED');

    const entitlements = await db.select().from(schema.corporateActionEntitlements).where(eq(schema.corporateActionEntitlements.is_deleted, false));

    return {
      pending: pending.length,
      upcoming: upcoming.length,
      processedToday: processedToday.length,
      totalEntitlements: entitlements.length,
    };
  },

  /** Get corporate actions history with filters and pagination */
  async getHistory(filters: { from?: string; to?: string; type?: string; status?: string; page: number; pageSize: number }) {
    let query = db.select().from(schema.corporateActions).where(eq(schema.corporateActions.is_deleted, false));
    const allCAs = await query;

    let filtered = allCAs;
    if (filters.from) filtered = filtered.filter((ca: typeof allCAs[number]) => ca.ex_date && ca.ex_date >= filters.from!);
    if (filters.to) filtered = filtered.filter((ca: typeof allCAs[number]) => ca.ex_date && ca.ex_date <= filters.to!);
    if (filters.type) filtered = filtered.filter((ca: typeof allCAs[number]) => ca.type === filters.type);
    if (filters.status) filtered = filtered.filter((ca: typeof allCAs[number]) => ca.ca_status === filters.status);

    const total = filtered.length;
    const offset = (filters.page - 1) * filters.pageSize;
    const data = filtered.slice(offset, offset + filters.pageSize);

    return { data, total, page: filters.page, pageSize: filters.pageSize };
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
