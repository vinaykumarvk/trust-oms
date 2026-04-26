/**
 * Tax Engine Service (Phase 3D)
 *
 * Philippine taxation engine handling WHT calculation, BIR form
 * generation (2306/2307/2316), FATCA/CRS reporting, and
 * monthly 1601-FQ filing aggregation.
 *
 * BRD FR-TAX: WHT rates by security type and residency, BIR
 * certificate generation, FATCA IDES data, CRS reporting.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, gte, lte, ne, count, type InferSelectModel } from 'drizzle-orm';
import { ttraService } from './ttra-service';

type TaxEvent = InferSelectModel<typeof schema.taxEvents>;

interface PortfolioSlice {
  portfolioId: string;
  aum: string | null;
  baseCurrency: string | null;
}

// ---------------------------------------------------------------------------
// Philippine WHT rates per NIRC / TRAIN / CREATE law
// ---------------------------------------------------------------------------

/**
 * Comprehensive Philippine tax rate schedule covering dividend and interest
 * income scenarios by residency classification.
 *
 *   DIVIDEND rates:
 *     RESIDENT_INDIVIDUAL           — 10% (Sec 24(B)(2) NIRC as amended by TRAIN)
 *     NON_RESIDENT_ENGAGED_TRADE    — 20% (Sec 25(A)(2))
 *     NON_RESIDENT_NOT_ENGAGED_TRADE — 25% (Sec 25(B))
 *     CORP_DOMESTIC                 — 0%  (exempt if >=20% ownership, Sec 27(D)(4))
 *     CORP_FOREIGN_RESIDENT         — 15% (Sec 28(B)(5)(b) CREATE)
 *     CORP_FOREIGN_NON_RESIDENT     — 30% (Sec 28(B)(1) before CREATE)
 *     TREATY_DEFAULT                — 15% (standard treaty ceiling)
 *
 *   INTEREST rates:
 *     SHORT_TERM (<5 years)         — 20% (Sec 24(B)(1) NIRC)
 *     LONG_TERM  (>=5 years)        — 0%  (exempt per TRAIN)
 *     FOREIGN_CURRENCY              — 0%  (exempt)
 */
const PH_TAX_RATES = {
  DIVIDEND: {
    RESIDENT_INDIVIDUAL: 0.10,
    NON_RESIDENT_ENGAGED_TRADE: 0.20,
    NON_RESIDENT_NOT_ENGAGED_TRADE: 0.25,
    CORP_DOMESTIC: 0.00,
    CORP_FOREIGN_RESIDENT: 0.15,
    CORP_FOREIGN_NON_RESIDENT: 0.30,
    TREATY_DEFAULT: 0.15,
  },
  INTEREST: {
    SHORT_TERM: 0.20,
    LONG_TERM: 0.00,
    FOREIGN_CURRENCY: 0.00,
  },
} as const;

/** Legacy lookup table for trade-based WHT (backward-compatible) */
const WHT_RATES: Record<string, Record<string, number>> = {
  BOND_INTEREST: {
    RESIDENT: 0.20,
    NON_RESIDENT: 0.30,
    CORP_RESIDENT: 0.20,
    CORP_NON_RESIDENT: 0.30,
  },
  EQUITY_DIVIDEND: {
    RESIDENT: 0.10,
    NON_RESIDENT: 0.25,
    CORP_RESIDENT: 0.00,
    CORP_NON_RESIDENT: 0.15,
  },
  UITF_INCOME: {
    RESIDENT: 0.00,
    NON_RESIDENT: 0.25,
    CORP_RESIDENT: 0.00,
    CORP_NON_RESIDENT: 0.25,
  },
  DEFAULT: {
    RESIDENT: 0.20,
    NON_RESIDENT: 0.30,
    CORP_RESIDENT: 0.20,
    CORP_NON_RESIDENT: 0.30,
  },
};

type ResidencyClassification =
  | 'RESIDENT_INDIVIDUAL'
  | 'NON_RESIDENT_ENGAGED_TRADE'
  | 'NON_RESIDENT_NOT_ENGAGED_TRADE'
  | 'CORP_DOMESTIC'
  | 'CORP_FOREIGN_RESIDENT'
  | 'CORP_FOREIGN_NON_RESIDENT';

// ---------------------------------------------------------------------------
// FATCA WHT rate — IRS mandated 30% for US persons (FR-ONB-004)
// ---------------------------------------------------------------------------

const FATCA_US_PERSON_WHT_RATE = 0.30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySecurityType(assetClass: string | null): string {
  if (!assetClass) return 'DEFAULT';
  const ac = assetClass.toUpperCase();
  if (ac.includes('BOND') || ac.includes('FIXED') || ac.includes('DEBT')) return 'BOND_INTEREST';
  if (ac.includes('EQUITY') || ac.includes('STOCK')) return 'EQUITY_DIVIDEND';
  if (ac.includes('UITF') || ac.includes('FUND') || ac.includes('MUTUAL')) return 'UITF_INCOME';
  return 'DEFAULT';
}

function deriveResidencyKey(
  clientType: string | null,
  fatcaCrsRecord: { reporting_jurisdictions: unknown } | null,
): string {
  const isCorp = clientType?.toUpperCase() === 'CORPORATE';
  // If client has foreign reporting jurisdictions, treat as non-resident
  let isNonResident = false;
  if (fatcaCrsRecord?.reporting_jurisdictions) {
    const jurisdictions = fatcaCrsRecord.reporting_jurisdictions as string[];
    if (Array.isArray(jurisdictions) && jurisdictions.length > 0) {
      isNonResident = true;
    }
  }
  if (isCorp) return isNonResident ? 'CORP_NON_RESIDENT' : 'CORP_RESIDENT';
  return isNonResident ? 'NON_RESIDENT' : 'RESIDENT';
}

// ---------------------------------------------------------------------------
// Residency classification helper
// ---------------------------------------------------------------------------

/**
 * Determine the granular Philippine tax-residency classification for a
 * client based on client type and FATCA/CRS data.
 */
async function getResidencyClassification(clientId: string): Promise<ResidencyClassification> {
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.client_id, clientId))
    .limit(1);

  const [fatcaCrs] = await db
    .select()
    .from(schema.clientFatcaCrs)
    .where(eq(schema.clientFatcaCrs.client_id, clientId))
    .limit(1);

  const isCorporate = client?.type?.toUpperCase() === 'CORPORATE';
  let isNonResident = false;

  if (fatcaCrs?.reporting_jurisdictions) {
    const jurisdictions = fatcaCrs.reporting_jurisdictions as string[];
    if (Array.isArray(jurisdictions) && jurisdictions.length > 0) {
      isNonResident = true;
    }
  }

  if (isCorporate) {
    if (!isNonResident) return 'CORP_DOMESTIC';
    // Check if engaged in trade — for simplicity, corporations with PH
    // presence (existing portfolios under trust) are treated as resident
    // foreign corporations; others as non-resident.
    const portfolios = await db
      .select({ portfolioId: schema.portfolios.portfolio_id })
      .from(schema.portfolios)
      .where(eq(schema.portfolios.client_id, clientId))
      .limit(1);
    return portfolios.length > 0 ? 'CORP_FOREIGN_RESIDENT' : 'CORP_FOREIGN_NON_RESIDENT';
  }

  if (!isNonResident) return 'RESIDENT_INDIVIDUAL';

  // Individual non-resident: check if engaged in trade in PH
  const portfolios = await db
    .select({ portfolioId: schema.portfolios.portfolio_id })
    .from(schema.portfolios)
    .where(eq(schema.portfolios.client_id, clientId))
    .limit(1);
  return portfolios.length > 0
    ? 'NON_RESIDENT_ENGAGED_TRADE'
    : 'NON_RESIDENT_NOT_ENGAGED_TRADE';
}

/**
 * Determine the applicable dividend WHT rate for a residency classification,
 * optionally applying a treaty rate if an active TTRA exists.
 */
function getDividendRate(
  classification: ResidencyClassification,
  hasTreaty: boolean,
): number {
  if (hasTreaty) {
    return PH_TAX_RATES.DIVIDEND.TREATY_DEFAULT;
  }
  return PH_TAX_RATES.DIVIDEND[classification];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const taxEngineService = {
  /**
   * Calculate WHT for a given trade.
   * Determines rate from security type + client residency, inserts tax event.
   */
  async calculateWHT(tradeId: string) {
    // 1. Get the trade
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) throw new Error(`Trade not found: ${tradeId}`);

    // 2. Get order for portfolio and security info
    let order = null;
    if (trade.order_id) {
      const [orderRow] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      order = orderRow ?? null;
    }

    if (!order) throw new Error(`Order not found for trade: ${tradeId}`);

    const portfolioId = order.portfolio_id;
    if (!portfolioId) throw new Error(`No portfolio on order for trade: ${tradeId}`);

    // 3. Get portfolio and client
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) throw new Error(`Portfolio not found: ${portfolioId}`);

    let client = null;
    if (portfolio.client_id) {
      const [clientRow] = await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.client_id, portfolio.client_id))
        .limit(1);
      client = clientRow ?? null;
    }

    // 4. Get FATCA/CRS record for residency determination
    let fatcaCrsRecord = null;
    if (client) {
      const [fatcaRow] = await db
        .select()
        .from(schema.clientFatcaCrs)
        .where(eq(schema.clientFatcaCrs.client_id, client.client_id))
        .limit(1);
      fatcaCrsRecord = fatcaRow ?? null;
    }

    // 5. Get security for asset class
    let security = null;
    if (order.security_id) {
      const [secRow] = await db
        .select()
        .from(schema.securities)
        .where(eq(schema.securities.id, order.security_id))
        .limit(1);
      security = secRow ?? null;
    }

    // 6. Determine rates
    const securityType = classifySecurityType(security?.asset_class ?? null);
    const residencyKey = deriveResidencyKey(client?.type ?? null, fatcaCrsRecord);
    const rateTable = WHT_RATES[securityType] ?? WHT_RATES.DEFAULT;
    let rate = rateTable[residencyKey] ?? rateTable.RESIDENT;

    // 6a. FR-ONB-004: Auto-propagate FATCA/CRS flags from clientFatcaCrs.
    //     If the client is flagged as a US person, override the WHT rate
    //     with the IRS-mandated 30% FATCA rate regardless of treaty status.
    let taxType: 'WHT' | 'FATCA' | 'CRS' = 'WHT';
    let crsJurisdictions: string[] = [];

    if (fatcaCrsRecord) {
      const usPerson = fatcaCrsRecord.us_person === true;
      const jurisdictions = Array.isArray(fatcaCrsRecord.reporting_jurisdictions)
        ? (fatcaCrsRecord.reporting_jurisdictions as string[])
        : [];

      if (usPerson) {
        // IRS mandates 30% WHT for US persons under FATCA
        rate = FATCA_US_PERSON_WHT_RATE;
        taxType = 'FATCA';
      }

      if (jurisdictions.length > 0) {
        crsJurisdictions = jurisdictions;
      }
    }

    // 7. Calculate amounts
    const grossAmount =
      parseFloat(trade.execution_price ?? '0') *
      parseFloat(trade.execution_qty ?? '0');
    const taxAmount = grossAmount * rate;

    // 8. Insert tax event
    const [taxEvent] = await db
      .insert(schema.taxEvents)
      .values({
        trade_id: tradeId,
        portfolio_id: portfolioId,
        tax_type: taxType,
        gross_amount: String(grossAmount),
        tax_rate: String(rate),
        tax_amount: String(taxAmount),
        tin: client?.tin ?? null,
        bir_form_type: rate > 0 ? '2307' : null,
        filing_status: 'PENDING',
        source: 'TRADE',
        model_version: 'PH-NIRC-TRAIN-v2',
      })
      .returning();

    // 8a. FR-ONB-004: If the client has CRS reporting jurisdictions,
    //     create an additional CRS tracking event for each jurisdiction
    //     to ensure reporting obligations are captured at trade time.
    if (crsJurisdictions.length > 0) {
      await db.insert(schema.taxEvents).values({
        trade_id: tradeId,
        portfolio_id: portfolioId,
        tax_type: 'CRS',
        gross_amount: String(grossAmount),
        tax_rate: '0',
        tax_amount: '0',
        tin: (fatcaCrsRecord as { tin_foreign?: string | null })?.tin_foreign ?? client?.tin ?? null,
        filing_status: 'PENDING',
        source: 'TRADE',
        model_version: 'PH-NIRC-TRAIN-v2',
      });
    }

    return taxEvent;
  },

  /**
   * Calculate WHT for a corporate action entitlement.
   *
   * Looks up the entitlement, determines client residency, checks for an
   * active TTRA (treaty), computes tax, and creates a tax event record
   * sourced from CORPORATE_ACTION.
   */
  async calculateCAWHT(entitlementId: number) {
    // 1. Look up the entitlement
    const [entitlement] = await db
      .select()
      .from(schema.corporateActionEntitlements)
      .where(eq(schema.corporateActionEntitlements.id, entitlementId))
      .limit(1);

    if (!entitlement) {
      throw new Error(`Entitlement not found: ${entitlementId}`);
    }

    const portfolioId = entitlement.portfolio_id;
    if (!portfolioId) throw new Error(`No portfolio on entitlement: ${entitlementId}`);

    // 2. Look up portfolio to get client_id
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) throw new Error(`Portfolio not found: ${portfolioId}`);

    const clientId = portfolio.client_id;
    if (!clientId) throw new Error(`No client on portfolio: ${portfolioId}`);

    // 3. Determine residency classification
    const classification = await getResidencyClassification(clientId);

    // 4. Check for active TTRA
    const todayStr = new Date().toISOString().split('T')[0];
    const activeTTRAs = await db
      .select()
      .from(schema.ttraApplications)
      .where(
        and(
          eq(schema.ttraApplications.client_id, clientId),
          eq(schema.ttraApplications.ttra_status, 'APPROVED'),
          eq(schema.ttraApplications.is_deleted, false),
          gte(schema.ttraApplications.effective_to, todayStr),
        ),
      )
      .limit(1);

    const activeTTRA = activeTTRAs[0] ?? null;
    const hasTreaty = activeTTRA !== null;

    // 5. Determine rate
    let rate = getDividendRate(classification, hasTreaty);

    // 5a. FR-ONB-004: Auto-propagate FATCA/CRS flags from clientFatcaCrs.
    //     Query the client's FATCA record to check us_person and CRS jurisdictions.
    const [fatcaCrs] = await db
      .select()
      .from(schema.clientFatcaCrs)
      .where(eq(schema.clientFatcaCrs.client_id, clientId))
      .limit(1);

    let taxType: 'WHT' | 'FATCA' | 'CRS' = 'WHT';
    let rateType: 'TREATY' | 'STATUTORY' | 'FATCA' = hasTreaty ? 'TREATY' : 'STATUTORY';
    let crsJurisdictions: string[] = [];

    if (fatcaCrs) {
      const usPerson = fatcaCrs.us_person === true;
      const jurisdictions = Array.isArray(fatcaCrs.reporting_jurisdictions)
        ? (fatcaCrs.reporting_jurisdictions as string[])
        : [];

      if (usPerson) {
        // IRS mandates 30% WHT for US persons under FATCA — overrides
        // both statutory and treaty rates
        rate = FATCA_US_PERSON_WHT_RATE;
        taxType = 'FATCA';
        rateType = 'FATCA';
      }

      if (jurisdictions.length > 0) {
        crsJurisdictions = jurisdictions;
      }
    }

    // 6. Calculate tax amount
    const entitledQty = parseFloat(entitlement.entitled_qty ?? '0');
    const grossAmount = entitledQty;
    const taxAmount = grossAmount * rate;

    // 7. Get client TIN for the tax event
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId))
      .limit(1);

    // 8. Create tax event
    const [taxEvent] = await db
      .insert(schema.taxEvents)
      .values({
        portfolio_id: portfolioId,
        tax_type: taxType,
        gross_amount: String(grossAmount),
        tax_rate: String(rate),
        tax_amount: String(taxAmount),
        tin: client?.tin ?? null,
        bir_form_type: rate > 0 ? '2307' : null,
        filing_status: 'PENDING',
        source: 'CORPORATE_ACTION',
        ttra_id: activeTTRA?.ttra_id ?? null,
        model_version: 'PH-NIRC-TRAIN-v2',
        entitlement_id: entitlementId,
      })
      .returning();

    // 8a. FR-ONB-004: If CRS reporting jurisdictions exist, create a CRS
    //     tracking event alongside the WHT/FATCA event.
    if (crsJurisdictions.length > 0) {
      await db.insert(schema.taxEvents).values({
        portfolio_id: portfolioId,
        tax_type: 'CRS',
        gross_amount: String(grossAmount),
        tax_rate: '0',
        tax_amount: '0',
        tin: fatcaCrs?.tin_foreign ?? client?.tin ?? null,
        filing_status: 'PENDING',
        source: 'CORPORATE_ACTION',
        model_version: 'PH-NIRC-TRAIN-v2',
        entitlement_id: entitlementId,
      });
    }

    return {
      taxEvent,
      taxAmount,
      rate,
      rateType,
      ttraId: activeTTRA?.ttra_id ?? undefined,
      fatcaApplied: taxType === 'FATCA',
      crsJurisdictions: crsJurisdictions.length > 0 ? crsJurisdictions : undefined,
    };
  },

  /**
   * Get the residency classification for a client.
   */
  async getResidencyClassification(clientId: string) {
    return getResidencyClassification(clientId);
  },

  /**
   * Generate a BIR form (2306, 2307, or 2316).
   */
  async generateBIRForm(
    formType: '2306' | '2307' | '2316',
    params: { portfolioId: string; periodFrom: string; periodTo: string },
  ) {
    if (formType === '2316') {
      // Wages stub — not applicable for trust operations
      return {
        formType,
        data: [],
        totalTax: 0,
        generatedAt: new Date().toISOString(),
        note: 'BIR 2316 (wages) is a stub — not applicable for trust portfolio operations.',
      };
    }

    // Build conditions for WHT events in the period
    const conditions = [
      eq(schema.taxEvents.tax_type, 'WHT'),
      gte(schema.taxEvents.created_at, new Date(params.periodFrom)),
      lte(schema.taxEvents.created_at, new Date(params.periodTo + 'T23:59:59Z')),
    ];

    if (params.portfolioId) {
      conditions.push(eq(schema.taxEvents.portfolio_id, params.portfolioId));
    }

    const events = await db
      .select()
      .from(schema.taxEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.taxEvents.created_at));

    // Group by portfolio (payee proxy)
    const grouped: Record<string, {
      portfolioId: string;
      tin: string | null;
      totalGross: number;
      totalTax: number;
      count: number;
      tradeCount: number;
      caCount: number;
    }> = {};

    for (const ev of events) {
      const key = ev.portfolio_id ?? 'UNKNOWN';
      if (!grouped[key]) {
        grouped[key] = { portfolioId: key, tin: ev.tin, totalGross: 0, totalTax: 0, count: 0, tradeCount: 0, caCount: 0 };
      }
      grouped[key].totalGross += parseFloat(ev.gross_amount ?? '0');
      grouped[key].totalTax += parseFloat(ev.tax_amount ?? '0');
      grouped[key].count += 1;
      if (ev.source === 'CORPORATE_ACTION') {
        grouped[key].caCount += 1;
      } else {
        grouped[key].tradeCount += 1;
      }
    }

    const records = Object.values(grouped);
    const totalTax = records.reduce((sum: number, r: { totalTax: number }) => sum + r.totalTax, 0);

    // Mark events with form type
    if (events.length > 0) {
      const eventIds = events.map((e: TaxEvent) => e.id);
      for (const eid of eventIds) {
        await db
          .update(schema.taxEvents)
          .set({ bir_form_type: formType, filing_status: 'GENERATED' })
          .where(eq(schema.taxEvents.id, eid));
      }
    }

    return {
      formType,
      data: records,
      totalTax,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * Generate FATCA report for a given year.
   * Queries clients flagged as US persons with year-end portfolio balances.
   */
  async generateFATCAReport(year: number) {
    // Find clients with us_person = true (FATCA reportable)
    const fatcaClients = await db
      .select({
        clientId: schema.clientFatcaCrs.client_id,
        usPerson: schema.clientFatcaCrs.us_person,
        tinForeign: schema.clientFatcaCrs.tin_foreign,
        reportingJurisdictions: schema.clientFatcaCrs.reporting_jurisdictions,
        legalName: schema.clients.legal_name,
        clientTin: schema.clients.tin,
      })
      .from(schema.clientFatcaCrs)
      .leftJoin(schema.clients, eq(schema.clientFatcaCrs.client_id, schema.clients.client_id))
      .where(eq(schema.clientFatcaCrs.us_person, true));

    // For each client, get portfolios with AUM as year-end proxy
    const reportData = [];
    for (const fc of fatcaClients) {
      if (!fc.clientId) continue;
      const portfolios: PortfolioSlice[] = await db
        .select({
          portfolioId: schema.portfolios.portfolio_id,
          aum: schema.portfolios.aum,
          baseCurrency: schema.portfolios.base_currency,
        })
        .from(schema.portfolios)
        .where(eq(schema.portfolios.client_id, fc.clientId));

      const totalBalance = portfolios.reduce((s: number, p: PortfolioSlice) => s + parseFloat(p.aum ?? '0'), 0);

      reportData.push({
        clientId: fc.clientId,
        legalName: fc.legalName,
        tin: fc.clientTin,
        tinForeign: fc.tinForeign,
        usPerson: fc.usPerson,
        portfolioCount: portfolios.length,
        totalBalance,
        currency: 'PHP',
        portfolios: portfolios.map((p: PortfolioSlice) => ({
          portfolioId: p.portfolioId,
          balance: parseFloat(p.aum ?? '0'),
          currency: p.baseCurrency ?? 'PHP',
        })),
      });
    }

    // Insert FATCA tax events for tracking
    for (const entry of reportData) {
      for (const p of entry.portfolios) {
        await db.insert(schema.taxEvents).values({
          portfolio_id: p.portfolioId,
          tax_type: 'FATCA',
          gross_amount: String(p.balance),
          tax_rate: '0',
          tax_amount: '0',
          tin: entry.tinForeign ?? entry.tin ?? null,
          filing_status: 'GENERATED',
        });
      }
    }

    return {
      reportType: 'FATCA',
      year,
      reportableAccounts: reportData.length,
      data: reportData,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * Generate CRS report for a given year.
   * Queries clients with foreign reporting jurisdictions.
   */
  async generateCRSReport(year: number) {
    // Find clients with non-empty reporting jurisdictions
    const crsClients = await db
      .select({
        clientId: schema.clientFatcaCrs.client_id,
        tinForeign: schema.clientFatcaCrs.tin_foreign,
        reportingJurisdictions: schema.clientFatcaCrs.reporting_jurisdictions,
        legalName: schema.clients.legal_name,
        clientTin: schema.clients.tin,
      })
      .from(schema.clientFatcaCrs)
      .leftJoin(schema.clients, eq(schema.clientFatcaCrs.client_id, schema.clients.client_id));

    // Filter to those with non-empty reporting jurisdictions (non-PH residents)
    type CrsClient = (typeof crsClients)[number];
    const nonResident = crsClients.filter((c: CrsClient) => {
      const jurisdictions = c.reportingJurisdictions as string[] | null;
      return Array.isArray(jurisdictions) && jurisdictions.length > 0;
    });

    const reportData = [];
    for (const nc of nonResident) {
      if (!nc.clientId) continue;
      const portfolios: PortfolioSlice[] = await db
        .select({
          portfolioId: schema.portfolios.portfolio_id,
          aum: schema.portfolios.aum,
          baseCurrency: schema.portfolios.base_currency,
        })
        .from(schema.portfolios)
        .where(eq(schema.portfolios.client_id, nc.clientId));

      const totalBalance = portfolios.reduce((s: number, p: PortfolioSlice) => s + parseFloat(p.aum ?? '0'), 0);

      reportData.push({
        clientId: nc.clientId,
        legalName: nc.legalName,
        tin: nc.clientTin,
        tinForeign: nc.tinForeign,
        reportingJurisdictions: nc.reportingJurisdictions,
        portfolioCount: portfolios.length,
        totalBalance,
        currency: 'PHP',
        portfolios: portfolios.map((p: PortfolioSlice) => ({
          portfolioId: p.portfolioId,
          balance: parseFloat(p.aum ?? '0'),
          currency: p.baseCurrency ?? 'PHP',
        })),
      });
    }

    // Insert CRS tax events for tracking
    for (const entry of reportData) {
      for (const p of entry.portfolios) {
        await db.insert(schema.taxEvents).values({
          portfolio_id: p.portfolioId,
          tax_type: 'CRS',
          gross_amount: String(p.balance),
          tax_rate: '0',
          tax_amount: '0',
          tin: entry.tinForeign ?? entry.tin ?? null,
          filing_status: 'GENERATED',
        });
      }
    }

    return {
      reportType: 'CRS',
      year,
      reportableAccounts: reportData.length,
      data: reportData,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * Generate monthly 1601-FQ filing.
   * Aggregates WHT for the given month from both trade-based (source='TRADE')
   * and corporate-action-based (source='CORPORATE_ACTION') tax events,
   * grouped by BIR form type and source.
   */
  async generate1601FQ(month: string) {
    const startDate = new Date(`${month}-01T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const events = await db
      .select()
      .from(schema.taxEvents)
      .where(
        and(
          eq(schema.taxEvents.tax_type, 'WHT'),
          gte(schema.taxEvents.created_at, startDate),
          lte(schema.taxEvents.created_at, endDate),
        ),
      );

    // Group by bir_form_type
    const breakdownMap: Record<string, { taxType: string; count: number; totalGross: number; totalTax: number }> = {};
    for (const ev of events) {
      const key = ev.bir_form_type ?? 'UNCLASSIFIED';
      if (!breakdownMap[key]) {
        breakdownMap[key] = { taxType: key, count: 0, totalGross: 0, totalTax: 0 };
      }
      breakdownMap[key].count += 1;
      breakdownMap[key].totalGross += parseFloat(ev.gross_amount ?? '0');
      breakdownMap[key].totalTax += parseFloat(ev.tax_amount ?? '0');
    }

    const breakdown = Object.values(breakdownMap);
    const totalWHT = breakdown.reduce((s: number, b: { totalTax: number }) => s + b.totalTax, 0);

    // Source-level breakdown: TRADE vs CORPORATE_ACTION
    const tradeEvents = events.filter((ev: TaxEvent) => (ev.source ?? 'TRADE') === 'TRADE');
    const caEvents = events.filter((ev: TaxEvent) => ev.source === 'CORPORATE_ACTION');

    const bySource = {
      TRADE: {
        count: tradeEvents.length,
        totalGross: tradeEvents.reduce((s: number, ev: TaxEvent) => s + parseFloat(ev.gross_amount ?? '0'), 0),
        totalTax: tradeEvents.reduce((s: number, ev: TaxEvent) => s + parseFloat(ev.tax_amount ?? '0'), 0),
      },
      CORPORATE_ACTION: {
        count: caEvents.length,
        totalGross: caEvents.reduce((s: number, ev: TaxEvent) => s + parseFloat(ev.gross_amount ?? '0'), 0),
        totalTax: caEvents.reduce((s: number, ev: TaxEvent) => s + parseFloat(ev.tax_amount ?? '0'), 0),
      },
    };

    return {
      month,
      totalWHT,
      eventCount: events.length,
      breakdown,
      bySource,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * Get tax events with filters and pagination.
   */
  async getTaxEvents(filters: {
    portfolioId?: string;
    taxType?: string;
    source?: string;
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(eq(schema.taxEvents.portfolio_id, filters.portfolioId));
    }
    if (filters.taxType) {
      conditions.push(
        eq(schema.taxEvents.tax_type, filters.taxType as 'WHT' | 'FATCA' | 'CRS'),
      );
    }
    if (filters.source) {
      conditions.push(eq(schema.taxEvents.source, filters.source));
    }
    if (filters.startDate) {
      conditions.push(gte(schema.taxEvents.created_at, new Date(filters.startDate)));
    }
    if (filters.endDate) {
      conditions.push(lte(schema.taxEvents.created_at, new Date(filters.endDate + 'T23:59:59Z')));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.taxEvents)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.taxEvents.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.taxEvents)
      .where(where);

    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /**
   * Get tax summary for a period.
   */
  async getTaxSummary(periodFrom: string, periodTo: string) {
    const conditions = [
      gte(schema.taxEvents.created_at, new Date(periodFrom)),
      lte(schema.taxEvents.created_at, new Date(periodTo + 'T23:59:59Z')),
    ];

    const where = and(...conditions);

    // Total events
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.taxEvents)
      .where(where);

    // WHT total
    const whtResult = await db
      .select({ total: sql<string>`coalesce(sum(cast(tax_amount as numeric)), 0)` })
      .from(schema.taxEvents)
      .where(and(...conditions, eq(schema.taxEvents.tax_type, 'WHT')));

    // FATCA reportable count
    const fatcaResult = await db
      .select({ count: sql<number>`count(distinct portfolio_id)` })
      .from(schema.taxEvents)
      .where(and(...conditions, eq(schema.taxEvents.tax_type, 'FATCA')));

    // BIR forms generated
    const birResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.taxEvents)
      .where(and(...conditions, eq(schema.taxEvents.filing_status, 'GENERATED')));

    // Breakdown by tax type
    const byType = await db
      .select({
        taxType: schema.taxEvents.tax_type,
        count: sql<number>`count(*)`,
        totalGross: sql<string>`coalesce(sum(cast(gross_amount as numeric)), 0)`,
        totalTax: sql<string>`coalesce(sum(cast(tax_amount as numeric)), 0)`,
      })
      .from(schema.taxEvents)
      .where(where)
      .groupBy(schema.taxEvents.tax_type);

    return {
      periodFrom,
      periodTo,
      totalEvents: Number(totalResult[0]?.count ?? 0),
      totalWHT: parseFloat(whtResult[0]?.total ?? '0'),
      fatcaReportableAccounts: Number(fatcaResult[0]?.count ?? 0),
      birFormsGenerated: Number(birResult[0]?.count ?? 0),
      byType,
    };
  },

  // -------------------------------------------------------------------------
  // Tax correction & recomputation (Phase 3D addendum)
  // -------------------------------------------------------------------------

  /**
   * Create an adjustment tax event linked to the original event via
   * `corrected_event_id`. The adjustment contains the original gross
   * amount plus the supplied delta corrections.
   *
   * @param eventId  - ID of the original tax event to correct.
   * @param corrections - Partial overrides: delta for gross_amount,
   *   tax_rate, and/or tax_amount. Any field not supplied keeps the
   *   original value.
   */
  async correctTaxEvent(
    eventId: number,
    corrections: {
      grossAmountDelta?: number;
      taxRateDelta?: number;
      taxAmountDelta?: number;
      reason?: string;
    },
  ) {
    // 1. Fetch original event
    const [original] = await db
      .select()
      .from(schema.taxEvents)
      .where(eq(schema.taxEvents.id, eventId))
      .limit(1);

    if (!original) throw new Error(`Tax event not found: ${eventId}`);

    // 2. Compute adjusted values
    const origGross = parseFloat(original.gross_amount ?? '0');
    const origRate = parseFloat(original.tax_rate ?? '0');
    const origTax = parseFloat(original.tax_amount ?? '0');

    const adjGross = origGross + (corrections.grossAmountDelta ?? 0);
    const adjRate = origRate + (corrections.taxRateDelta ?? 0);
    const adjTax = corrections.taxAmountDelta !== undefined
      ? origTax + corrections.taxAmountDelta
      : adjGross * adjRate;

    // 3. Insert the adjustment event linked to the original
    const [adjustmentEvent] = await db
      .insert(schema.taxEvents)
      .values({
        trade_id: original.trade_id,
        portfolio_id: original.portfolio_id,
        tax_type: original.tax_type,
        gross_amount: String(adjGross),
        tax_rate: String(adjRate),
        tax_amount: String(adjTax),
        tin: original.tin,
        bir_form_type: original.bir_form_type,
        filing_status: 'PENDING',
        source: `CORRECTION:${eventId}`,
        ttra_id: original.ttra_id,
        model_version: original.model_version,
        entitlement_id: original.entitlement_id,
        corrected_event_id: eventId,
      })
      .returning();

    // 4. Mark the original event as corrected
    await db
      .update(schema.taxEvents)
      .set({ filing_status: 'CORRECTED' })
      .where(eq(schema.taxEvents.id, eventId));

    return {
      originalEventId: eventId,
      adjustmentEvent,
      deltas: {
        grossAmount: corrections.grossAmountDelta ?? 0,
        taxRate: corrections.taxRateDelta ?? 0,
        taxAmount: adjTax - origTax,
      },
      reason: corrections.reason ?? null,
    };
  },

  /**
   * Replay the tax calculation for a previously computed tax event
   * using current rates and TTRA status. If the recomputed tax
   * differs from the original, a corrected event is created.
   *
   * Supports both TRADE-sourced and CORPORATE_ACTION-sourced events.
   *
   * @param eventId - ID of the tax event to recompute.
   * @returns The original and (optionally) new corrected event.
   */
  async recomputeTax(eventId: number) {
    // 1. Fetch the original tax event
    const [original] = await db
      .select()
      .from(schema.taxEvents)
      .where(eq(schema.taxEvents.id, eventId))
      .limit(1);

    if (!original) throw new Error(`Tax event not found: ${eventId}`);

    const portfolioId = original.portfolio_id;
    if (!portfolioId) throw new Error(`No portfolio on tax event: ${eventId}`);

    // 2. Resolve the portfolio and client
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) throw new Error(`Portfolio not found: ${portfolioId}`);

    const clientId = portfolio.client_id;
    if (!clientId) throw new Error(`No client on portfolio: ${portfolioId}`);

    // 3. Determine current residency classification
    const classification = await getResidencyClassification(clientId);

    // 4. Check for an active TTRA as of today
    const todayStr = new Date().toISOString().split('T')[0];
    const activeTTRAs = await db
      .select()
      .from(schema.ttraApplications)
      .where(
        and(
          eq(schema.ttraApplications.client_id, clientId),
          eq(schema.ttraApplications.ttra_status, 'APPROVED'),
          eq(schema.ttraApplications.is_deleted, false),
          gte(schema.ttraApplications.effective_to, todayStr),
        ),
      )
      .limit(1);

    const activeTTRA = activeTTRAs[0] ?? null;
    const hasTreaty = activeTTRA !== null;

    // 5. Recalculate the gross amount depending on source
    let newGross = parseFloat(original.gross_amount ?? '0');

    if (original.source === 'TRADE' && original.trade_id) {
      // Re-derive gross from the trade
      const [trade] = await db
        .select()
        .from(schema.trades)
        .where(eq(schema.trades.trade_id, original.trade_id))
        .limit(1);
      if (trade) {
        newGross =
          parseFloat(trade.execution_price ?? '0') *
          parseFloat(trade.execution_qty ?? '0');
      }
    } else if (original.source === 'CORPORATE_ACTION' && original.entitlement_id) {
      const [entitlement] = await db
        .select()
        .from(schema.corporateActionEntitlements)
        .where(eq(schema.corporateActionEntitlements.id, original.entitlement_id))
        .limit(1);
      if (entitlement) {
        newGross = parseFloat(entitlement.entitled_qty ?? '0');
      }
    }

    // 6. FR-ONB-004: Fetch current FATCA/CRS status for the client so we
    //    can auto-propagate the us_person flag into rate determination.
    const [recomputeFatcaCrs] = await db
      .select()
      .from(schema.clientFatcaCrs)
      .where(eq(schema.clientFatcaCrs.client_id, clientId))
      .limit(1);

    const isUsPerson = recomputeFatcaCrs?.us_person === true;

    // 7. Determine the new rate
    let newRate: number;
    let newTaxType: 'WHT' | 'FATCA' | 'CRS' = original.tax_type as 'WHT' | 'FATCA' | 'CRS';

    if (original.tax_type === 'WHT' || original.tax_type === 'FATCA') {
      // FR-ONB-004: If the client is now flagged as a US person, apply the
      // FATCA 30% rate regardless of residency classification or treaty.
      if (isUsPerson) {
        newRate = FATCA_US_PERSON_WHT_RATE;
        newTaxType = 'FATCA';
      } else if (original.source === 'CORPORATE_ACTION') {
        // For WHT on dividends/corporate actions, use the residency-aware rate
        newRate = getDividendRate(classification, hasTreaty);
        newTaxType = 'WHT';
      } else {
        // Trade-based: use the legacy rate table for the security type
        let security = null;
        if (original.trade_id) {
          const [trade] = await db
            .select()
            .from(schema.trades)
            .where(eq(schema.trades.trade_id, original.trade_id))
            .limit(1);
          if (trade?.order_id) {
            const [order] = await db
              .select()
              .from(schema.orders)
              .where(eq(schema.orders.order_id, trade.order_id))
              .limit(1);
            if (order?.security_id) {
              const [secRow] = await db
                .select()
                .from(schema.securities)
                .where(eq(schema.securities.id, order.security_id))
                .limit(1);
              security = secRow ?? null;
            }
          }
        }

        const [client] = await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.client_id, clientId))
          .limit(1);

        const securityType = classifySecurityType(security?.asset_class ?? null);
        const residencyKey = deriveResidencyKey(client?.type ?? null, recomputeFatcaCrs ?? null);
        const rateTable = WHT_RATES[securityType] ?? WHT_RATES.DEFAULT;
        newRate = rateTable[residencyKey] ?? rateTable.RESIDENT;
        newTaxType = 'WHT';
      }
    } else {
      // For non-WHT events (CRS), rate stays 0
      newRate = parseFloat(original.tax_rate ?? '0');
    }

    const newTax = newGross * newRate;
    const origTax = parseFloat(original.tax_amount ?? '0');

    // 8. If the recomputed amount or tax type differs, create a corrected event
    const tolerance = 0.005; // half a centavo
    const taxTypeChanged = newTaxType !== original.tax_type;
    if (Math.abs(newTax - origTax) <= tolerance && !taxTypeChanged) {
      return {
        status: 'NO_CHANGE' as const,
        originalEventId: eventId,
        originalTax: origTax,
        recomputedTax: newTax,
        correctedEvent: null,
      };
    }

    // Create the corrected event (uses newTaxType to reflect FATCA upgrade)
    const [correctedEvent] = await db
      .insert(schema.taxEvents)
      .values({
        trade_id: original.trade_id,
        portfolio_id: original.portfolio_id,
        tax_type: newTaxType,
        gross_amount: String(newGross),
        tax_rate: String(newRate),
        tax_amount: String(newTax),
        tin: original.tin,
        bir_form_type: original.bir_form_type,
        filing_status: 'PENDING',
        source: original.source,
        ttra_id: activeTTRA?.ttra_id ?? original.ttra_id,
        model_version: 'PH-NIRC-TRAIN-v2-RECOMPUTED',
        entitlement_id: original.entitlement_id,
        corrected_event_id: eventId,
      })
      .returning();

    // Mark original as superseded
    await db
      .update(schema.taxEvents)
      .set({ filing_status: 'CORRECTED' })
      .where(eq(schema.taxEvents.id, eventId));

    return {
      status: 'CORRECTED' as const,
      originalEventId: eventId,
      originalTax: origTax,
      recomputedTax: newTax,
      delta: newTax - origTax,
      correctedEvent,
    };
  },

  // -------------------------------------------------------------------------
  // Stock Transaction Tax (STT) — Philippine TRAIN Law
  // -------------------------------------------------------------------------

  /**
   * Calculate Stock Transaction Tax (STT) for a listed-equity sell trade.
   *
   * Per the Philippine TRAIN Law (RA 10963), the STT is 0.6% of the
   * gross selling price for shares of stock listed and traded through
   * the local stock exchange (PSE).
   *
   * @param tradeId - The trade to compute STT for.
   * @returns The created tax event with STT computation details.
   */
  async calculateSTT(tradeId: string) {
    const STT_RATE = 0.006; // 0.6% per TRAIN law

    // 1. Get the trade
    const [trade] = await db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.trade_id, tradeId))
      .limit(1);

    if (!trade) throw new Error(`Trade not found: ${tradeId}`);

    // 2. Get order for portfolio and security context
    let order = null;
    if (trade.order_id) {
      const [orderRow] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.order_id, trade.order_id))
        .limit(1);
      order = orderRow ?? null;
    }

    if (!order) throw new Error(`Order not found for trade: ${tradeId}`);

    const portfolioId = order.portfolio_id;
    if (!portfolioId) throw new Error(`No portfolio on order for trade: ${tradeId}`);

    // 3. Validate this is a SELL trade on a listed equity
    const side = (trade.side ?? order.side ?? '').toUpperCase();
    if (side !== 'SELL') {
      throw new Error(`STT applies only to sell trades. Trade ${tradeId} side is "${side}".`);
    }

    // Check if the security is a listed equity
    let security = null;
    if (order.security_id) {
      const [secRow] = await db
        .select()
        .from(schema.securities)
        .where(eq(schema.securities.id, order.security_id))
        .limit(1);
      security = secRow ?? null;
    }

    const assetClass = (security?.asset_class ?? '').toUpperCase();
    if (!assetClass.includes('EQUITY') && !assetClass.includes('STOCK')) {
      throw new Error(
        `STT applies only to listed equities. Security asset_class is "${security?.asset_class ?? 'unknown'}".`,
      );
    }

    // 4. Get client TIN
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    let clientTin: string | null = null;
    if (portfolio?.client_id) {
      const [client] = await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.client_id, portfolio.client_id))
        .limit(1);
      clientTin = client?.tin ?? null;
    }

    // 5. Calculate gross selling price and STT
    const grossSellingPrice =
      parseFloat(trade.execution_price ?? '0') *
      parseFloat(trade.execution_qty ?? '0');
    const sttAmount = grossSellingPrice * STT_RATE;

    // 6. Insert tax event
    const [taxEvent] = await db
      .insert(schema.taxEvents)
      .values({
        trade_id: tradeId,
        portfolio_id: portfolioId,
        tax_type: 'WHT',        // STT is recorded under WHT umbrella for BIR filing
        gross_amount: String(grossSellingPrice),
        tax_rate: String(STT_RATE),
        tax_amount: String(sttAmount),
        tin: clientTin,
        bir_form_type: null,     // STT is remitted by the broker, no BIR certificate
        filing_status: 'PENDING',
        source: 'STT',
        model_version: 'PH-TRAIN-STT-v1',
      })
      .returning();

    return {
      taxEvent,
      grossSellingPrice,
      sttRate: STT_RATE,
      sttAmount,
      tradeId,
    };
  },

  // -------------------------------------------------------------------------
  // BIR 1604-E Annual Information Return
  // -------------------------------------------------------------------------

  /**
   * Generate BIR Form 1604-E — Annual Information Return of Creditable
   * Income Taxes Withheld (Expanded).
   *
   * Aggregates all WHT events for the given calendar year, grouped by
   * payee (TIN). Each payee summary includes total gross income,
   * total tax withheld, and the count of transactions.
   *
   * @param year - The calendar year to generate the return for.
   * @returns The 1604-E form data with per-payee breakdown.
   */
  async generate1604E(year: number) {
    const startDate = new Date(`${year}-01-01T00:00:00Z`);
    const endDate = new Date(`${year}-12-31T23:59:59Z`);

    // 1. Fetch all WHT events for the year
    const events = await db
      .select()
      .from(schema.taxEvents)
      .where(
        and(
          eq(schema.taxEvents.tax_type, 'WHT'),
          gte(schema.taxEvents.created_at, startDate),
          lte(schema.taxEvents.created_at, endDate),
          // Exclude corrected (superseded) events to avoid double counting
          ne(schema.taxEvents.filing_status, 'CORRECTED'),
        ),
      )
      .orderBy(schema.taxEvents.tin);

    // 2. Aggregate by payee TIN
    const payeeMap: Record<string, {
      tin: string;
      portfolioIds: Set<string>;
      totalGross: number;
      totalTax: number;
      transactionCount: number;
      birForms: Set<string>;
      sources: Set<string>;
    }> = {};

    for (const ev of events) {
      const payeeTin = ev.tin ?? 'NO_TIN';
      if (!payeeMap[payeeTin]) {
        payeeMap[payeeTin] = {
          tin: payeeTin,
          portfolioIds: new Set(),
          totalGross: 0,
          totalTax: 0,
          transactionCount: 0,
          birForms: new Set(),
          sources: new Set(),
        };
      }
      const entry = payeeMap[payeeTin];
      if (ev.portfolio_id) entry.portfolioIds.add(ev.portfolio_id);
      entry.totalGross += parseFloat(ev.gross_amount ?? '0');
      entry.totalTax += parseFloat(ev.tax_amount ?? '0');
      entry.transactionCount += 1;
      if (ev.bir_form_type) entry.birForms.add(ev.bir_form_type);
      if (ev.source) entry.sources.add(ev.source);
    }

    // 3. Build the payee summary array
    const payeeSummaries = Object.values(payeeMap).map((entry) => ({
      tin: entry.tin,
      portfolioIds: Array.from(entry.portfolioIds),
      totalGrossIncome: entry.totalGross,
      totalTaxWithheld: entry.totalTax,
      transactionCount: entry.transactionCount,
      birForms: Array.from(entry.birForms),
      sources: Array.from(entry.sources),
    }));

    const grandTotalGross = payeeSummaries.reduce((s, p) => s + p.totalGrossIncome, 0);
    const grandTotalTax = payeeSummaries.reduce((s, p) => s + p.totalTaxWithheld, 0);

    // 4. Mark the events as included in the 1604-E
    if (events.length > 0) {
      const eventIds = events.map((e: TaxEvent) => e.id);
      for (const eid of eventIds) {
        await db
          .update(schema.taxEvents)
          .set({ bir_form_type: '1604-E', filing_status: 'GENERATED' })
          .where(eq(schema.taxEvents.id, eid));
      }
    }

    return {
      formType: '1604-E',
      year,
      payeeCount: payeeSummaries.length,
      grandTotalGrossIncome: grandTotalGross,
      grandTotalTaxWithheld: grandTotalTax,
      totalEvents: events.length,
      payees: payeeSummaries,
      generatedAt: new Date().toISOString(),
    };
  },

  // -------------------------------------------------------------------------
  // eFPS submission stub
  // -------------------------------------------------------------------------

  /**
   * Submit a BIR form to the Electronic Filing and Payment System (eFPS).
   *
   * This is a stub implementation that records the submission attempt and
   * status. In production, this would integrate with the BIR eFPS API.
   *
   * Includes retry logic: up to 3 attempts with exponential back-off
   * (simulated via attempt counter — actual delay is not applied in the
   * stub).
   *
   * @param formId - The ID of the tax event / form to submit.
   * @returns Submission result including attempt history.
   */
  async submitToEFPS(formId: number) {
    const MAX_RETRIES = 3;

    // 1. Fetch the form / tax event
    const [taxEvent] = await db
      .select()
      .from(schema.taxEvents)
      .where(eq(schema.taxEvents.id, formId))
      .limit(1);

    if (!taxEvent) throw new Error(`Tax event / form not found: ${formId}`);

    if (taxEvent.filing_status === 'SUBMITTED') {
      return {
        formId,
        status: 'ALREADY_SUBMITTED' as const,
        message: `Form ${formId} has already been submitted to eFPS.`,
        submittedAt: taxEvent.updated_at?.toISOString() ?? null,
      };
    }

    // 2. Simulate submission attempts with retry logic
    const attempts: Array<{
      attempt: number;
      status: 'SUCCESS' | 'FAILED';
      timestamp: string;
      errorMessage?: string;
    }> = [];

    let submitted = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const timestamp = new Date().toISOString();

      // Stub: simulate the eFPS call. In production this would be an
      // HTTP request to the BIR eFPS gateway. The stub always succeeds
      // on the first attempt to avoid blocking development flows.
      const success = attempt === 1; // first attempt succeeds in stub

      if (success) {
        attempts.push({ attempt, status: 'SUCCESS', timestamp });
        submitted = true;
        break;
      } else {
        attempts.push({
          attempt,
          status: 'FAILED',
          timestamp,
          errorMessage: `eFPS gateway timeout (attempt ${attempt}/${MAX_RETRIES})`,
        });
        // In production: await delay with exponential back-off
        // e.g. await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }

    // 3. Update the tax event with submission status
    const finalStatus = submitted ? 'SUBMITTED' : 'SUBMISSION_FAILED';
    await db
      .update(schema.taxEvents)
      .set({ filing_status: finalStatus })
      .where(eq(schema.taxEvents.id, formId));

    return {
      formId,
      status: finalStatus as 'SUBMITTED' | 'SUBMISSION_FAILED',
      attempts,
      totalAttempts: attempts.length,
      submittedAt: submitted ? attempts[attempts.length - 1].timestamp : null,
      message: submitted
        ? `Form ${formId} successfully submitted to eFPS.`
        : `Form ${formId} submission failed after ${MAX_RETRIES} attempts.`,
    };
  },
};
