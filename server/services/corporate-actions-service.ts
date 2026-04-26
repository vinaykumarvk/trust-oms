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
import { notificationService } from './notification-service';

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
    let caWhtResult: { taxAmount: number; rate: number; rateType: 'FATCA' | 'TREATY' | 'STATUTORY'; ttraId?: string; fatcaApplied?: boolean; crsJurisdictions?: string[] } | null = null;

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

  /**
   * Amend a corporate action event by creating a new versioned row.
   * The original event retains its data unchanged; a new row is inserted
   * with `amended_from_id` pointing back to the original for full audit trail.
   * Triggers re-scrub if the current status allows it (ANNOUNCED or SCRUBBED).
   */
  async amendEvent(
    eventId: number,
    changes: Partial<{
      exDate: string;
      recordDate: string;
      paymentDate: string;
      ratio: string;
      amountPerShare: string;
      electionDeadline: string;
      source: string;
      type: (typeof schema.corporateActionTypeEnum.enumValues)[number];
    }>,
    userId: string,
  ) {
    // Fetch the original event
    const [original] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, eventId))
      .limit(1);

    if (!original) {
      throw new Error(`Corporate action not found: ${eventId}`);
    }

    // Only allow amendments on events that are not yet settled or cancelled
    const nonAmendableStatuses = ['SETTLED', 'CANCELLED'];
    if (nonAmendableStatuses.includes(original.ca_status ?? '')) {
      throw new Error(
        `Cannot amend CA ${eventId}: current status '${original.ca_status}' does not allow amendments`,
      );
    }

    // Compute the next event version
    const currentVersion = (original as Record<string, unknown>).event_version as number | null;
    const nextVersion = (currentVersion ?? 1) + 1;

    // Build the new row, merging original data with the supplied changes
    const [amended] = await db
      .insert(schema.corporateActions)
      .values({
        security_id: original.security_id,
        type: changes.type ?? original.type,
        ex_date: changes.exDate ?? original.ex_date,
        record_date: changes.recordDate ?? original.record_date,
        payment_date: changes.paymentDate ?? original.payment_date ?? null,
        ratio: changes.ratio ?? original.ratio ?? null,
        amount_per_share: changes.amountPerShare ?? original.amount_per_share ?? null,
        election_deadline: changes.electionDeadline ?? original.election_deadline ?? null,
        source: changes.source ?? original.source ?? null,
        ca_status: 'ANNOUNCED', // Reset to ANNOUNCED so it goes through scrub again
        legal_entity_id: original.legal_entity_id,
        calendar_key: original.calendar_key,
        golden_copy_source: original.golden_copy_source,
        scrub_status: null, // Clear scrub status for re-scrub
        event_version: nextVersion,
        amended_from_id: original.id,
        created_by: userId,
        updated_by: userId,
      } as Record<string, unknown>)
      .returning();

    // Mark the original event as superseded (update its status metadata)
    await db
      .update(schema.corporateActions)
      .set({
        updated_at: new Date(),
        updated_by: userId,
      })
      .where(eq(schema.corporateActions.id, eventId));

    // Trigger re-scrub on the new version if the original was at a scrub-eligible stage
    const scrubEligible = ['ANNOUNCED', 'SCRUBBED'];
    let scrubResult = null;
    if (scrubEligible.includes(original.ca_status ?? '')) {
      try {
        scrubResult = await this.scrubEvent(amended.id);
      } catch (_err) {
        // Scrub failure is non-blocking; the amended event stays at ANNOUNCED
        scrubResult = null;
      }
    }

    // Dispatch amendment notification
    try {
      await notificationService.dispatch({
        eventType: 'CA_AMENDED',
        channel: 'IN_APP',
        recipientId: userId,
        recipientType: 'user',
        content: `Corporate action ${eventId} amended: new version ${nextVersion} created (CA id ${amended.id})`,
      });
    } catch (_notifErr) {
      // Non-blocking: notification failure should not affect the amendment
    }

    return {
      original: { id: original.id, version: currentVersion ?? 1 },
      amended,
      scrubResult,
    };
  },

  /**
   * Cancel a corporate action event.
   * Sets status to CANCELLED, records the cancellation reason, and reverses
   * any pending (unposted) entitlements by marking them as cancelled.
   */
  async cancelEvent(eventId: number, reason: string, userId: string) {
    // Fetch the event
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, eventId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${eventId}`);
    }

    // Cannot cancel an already-cancelled event
    if (ca.ca_status === 'CANCELLED') {
      throw new Error(`Corporate action ${eventId} is already cancelled`);
    }

    // Cannot cancel a fully settled event
    if (ca.ca_status === 'SETTLED') {
      throw new Error(
        `Cannot cancel CA ${eventId}: it has already been settled. Reversal must be done through a separate adjustment.`,
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required');
    }

    // Mark the event as CANCELLED with the reason
    const [updated] = await db
      .update(schema.corporateActions)
      .set({
        ca_status: 'CANCELLED',
        cancellation_reason: reason,
        updated_at: new Date(),
        updated_by: userId,
      } as Record<string, unknown>)
      .where(eq(schema.corporateActions.id, eventId))
      .returning();

    // Fetch all entitlements for this CA
    const entitlements = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.corporate_action_id, eventId));

    // Reverse pending (unposted) entitlements by marking them cancelled
    const cancelledEntitlementIds: number[] = [];
    const skippedPostedIds: number[] = [];

    for (const ent of entitlements) {
      if (ent.posted) {
        // Already posted entitlements cannot be auto-reversed; flag for manual review
        skippedPostedIds.push(ent.id);
      } else {
        // Mark unposted entitlement as cancelled
        await db
          .update(schema.corporateActionEntitlements)
          .set({
            status: 'cancelled',
            updated_at: new Date(),
            updated_by: userId,
          })
          .where(eq(schema.corporateActionEntitlements.id, ent.id));
        cancelledEntitlementIds.push(ent.id);
      }
    }

    // Dispatch cancellation notification
    try {
      await notificationService.dispatch({
        eventType: 'CA_CANCELLED',
        channel: 'IN_APP',
        recipientId: userId,
        recipientType: 'user',
        content: `Corporate action ${eventId} cancelled: ${reason}. ${cancelledEntitlementIds.length} entitlement(s) reversed.`,
      });
    } catch (_notifErr) {
      // Non-blocking: notification failure should not affect the cancellation
    }

    return {
      event: updated,
      cancelledEntitlements: cancelledEntitlementIds,
      skippedPostedEntitlements: skippedPostedIds,
      warning: skippedPostedIds.length > 0
        ? `${skippedPostedIds.length} entitlement(s) already posted and require manual reversal`
        : null,
    };
  },

  /**
   * Replay entitlement calculation from the golden copy of a corporate action.
   * Re-runs the calculation for all portfolios that previously had entitlements,
   * compares with previous results, and flags differences.
   * Uses the existing calculateEntitlement() and simulateEntitlement() methods.
   */
  async replayEvent(eventId: number) {
    // Fetch the event
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, eventId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${eventId}`);
    }

    // Must be at GOLDEN_COPY or later to replay from authoritative data
    const replayableStatuses = ['GOLDEN_COPY', 'ENTITLED', 'ELECTED', 'SETTLED'];
    if (!replayableStatuses.includes(ca.ca_status ?? '')) {
      throw new Error(
        `Cannot replay CA ${eventId}: status '${ca.ca_status}' is not at GOLDEN_COPY or beyond`,
      );
    }

    // Get all existing entitlements for this CA
    const existingEntitlements = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.corporate_action_id, eventId));

    if (existingEntitlements.length === 0) {
      throw new Error(`No existing entitlements found for CA ${eventId} to replay against`);
    }

    // Collect unique portfolio IDs from existing entitlements
    const portfolioIds = [
      ...new Set(existingEntitlements.map((e: Record<string, unknown>) => e.portfolio_id).filter(Boolean)),
    ] as string[];

    const results: Array<{
      portfolioId: string;
      previousQty: number;
      recalculatedQty: number;
      difference: number;
      hasDifference: boolean;
      entitlementId: number;
    }> = [];

    // For each portfolio, simulate the entitlement from current golden copy data
    // and compare against the previously stored entitled_qty
    for (const portfolioId of portfolioIds) {
      const previousEntitlement = existingEntitlements.find(
        (e: Record<string, unknown>) => e.portfolio_id === portfolioId,
      );
      const previousQty = parseFloat(previousEntitlement?.entitled_qty ?? '0');

      try {
        // Use simulateEntitlement to recalculate without persisting
        const simulation = await this.simulateEntitlement(eventId, portfolioId);
        const recalculatedQty = simulation.entitled_qty;
        const difference = recalculatedQty - previousQty;

        results.push({
          portfolioId,
          previousQty,
          recalculatedQty,
          difference,
          hasDifference: Math.abs(difference) > 0.0001, // tolerance for floating-point
          entitlementId: previousEntitlement!.id,
        });
      } catch (err: unknown) {
        // Position may have changed or been removed; flag as difference
        results.push({
          portfolioId,
          previousQty,
          recalculatedQty: 0,
          difference: -previousQty,
          hasDifference: previousQty !== 0,
          entitlementId: previousEntitlement!.id,
        });
      }
    }

    const differences = results.filter((r) => r.hasDifference);

    return {
      eventId,
      ca_status: ca.ca_status,
      totalPortfolios: portfolioIds.length,
      matched: results.filter((r) => !r.hasDifference).length,
      mismatched: differences.length,
      differences,
      results,
    };
  },

  /**
   * Override the settlement/payment date of a corporate action with maker-checker audit trail.
   * Records the override reason and the previous date for audit purposes.
   */
  async overrideSettlementDate(
    eventId: number,
    newDate: string,
    reason: string,
  ) {
    if (!newDate || newDate.trim().length === 0) {
      throw new Error('New settlement date is required');
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('Override reason is required');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      throw new Error(`Invalid date format: '${newDate}'. Expected YYYY-MM-DD.`);
    }

    // Fetch the event
    const [ca] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, eventId))
      .limit(1);

    if (!ca) {
      throw new Error(`Corporate action not found: ${eventId}`);
    }

    // Cannot override dates on cancelled or settled events
    if (ca.ca_status === 'CANCELLED') {
      throw new Error(`Cannot override settlement date on cancelled CA ${eventId}`);
    }
    if (ca.ca_status === 'SETTLED') {
      throw new Error(`Cannot override settlement date on settled CA ${eventId}`);
    }

    const previousDate = ca.payment_date;

    // New date must be different from existing
    if (previousDate === newDate) {
      throw new Error(
        `New settlement date '${newDate}' is the same as the current payment_date`,
      );
    }

    // Insert an audit trail record for the maker-checker override
    // Uses the correlation_id field to capture the override metadata
    const auditCorrelation = JSON.stringify({
      action: 'SETTLEMENT_DATE_OVERRIDE',
      previous_payment_date: previousDate,
      new_payment_date: newDate,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Update the payment_date with maker-checker audit trail
    const [updated] = await db
      .update(schema.corporateActions)
      .set({
        payment_date: newDate,
        correlation_id: auditCorrelation,
        updated_at: new Date(),
        version: sql`${schema.corporateActions.version} + 1`,
      })
      .where(eq(schema.corporateActions.id, eventId))
      .returning();

    return {
      event: updated,
      previousPaymentDate: previousDate,
      newPaymentDate: newDate,
      reason,
      auditCorrelation,
    };
  },
};
