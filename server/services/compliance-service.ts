/**
 * Compliance Workbench Service (Phase 4A)
 *
 * Centralized compliance workbench providing breach management,
 * AML alerts, trade surveillance, STR queue, and health scoring.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, isNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BreachFilters {
  portfolioId?: string;
  status?: 'open' | 'resolved';
  severity?: string;
  page?: number;
  pageSize?: number;
}

interface AmlAlertFilters {
  riskRating?: string;
  page?: number;
  pageSize?: number;
}

interface SurveillanceAlertFilters {
  pattern?: string;
  disposition?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const complianceService = {
  // -------------------------------------------------------------------------
  // List breaches (paginated, filterable)
  // -------------------------------------------------------------------------
  async getBreaches(filters: BreachFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.portfolioId) {
      conditions.push(
        eq(schema.complianceBreaches.portfolio_id, filters.portfolioId),
      );
    }

    if (filters.status === 'open') {
      conditions.push(isNull(schema.complianceBreaches.resolved_at));
    } else if (filters.status === 'resolved') {
      sql`${schema.complianceBreaches.resolved_at} IS NOT NULL`;
      conditions.push(
        sql`${schema.complianceBreaches.resolved_at} IS NOT NULL` as any,
      );
    }

    if (filters.severity) {
      conditions.push(eq(schema.complianceRules.severity, filters.severity));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.complianceBreaches.id,
        rule_id: schema.complianceBreaches.rule_id,
        portfolio_id: schema.complianceBreaches.portfolio_id,
        order_id: schema.complianceBreaches.order_id,
        breach_description: schema.complianceBreaches.breach_description,
        detected_at: schema.complianceBreaches.detected_at,
        resolved_at: schema.complianceBreaches.resolved_at,
        resolution: schema.complianceBreaches.resolution,
        created_at: schema.complianceBreaches.created_at,
        rule_type: schema.complianceRules.rule_type,
        rule_severity: schema.complianceRules.severity,
        rule_action: schema.complianceRules.action,
        rule_entity_type: schema.complianceRules.entity_type,
      })
      .from(schema.complianceBreaches)
      .leftJoin(
        schema.complianceRules,
        eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
      )
      .where(where)
      .orderBy(desc(schema.complianceBreaches.detected_at))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.complianceBreaches)
      .leftJoin(
        schema.complianceRules,
        eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
      )
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Get single breach with rule details
  // -------------------------------------------------------------------------
  async getBreach(id: number) {
    const [breach] = await db
      .select({
        id: schema.complianceBreaches.id,
        rule_id: schema.complianceBreaches.rule_id,
        portfolio_id: schema.complianceBreaches.portfolio_id,
        order_id: schema.complianceBreaches.order_id,
        breach_description: schema.complianceBreaches.breach_description,
        detected_at: schema.complianceBreaches.detected_at,
        resolved_at: schema.complianceBreaches.resolved_at,
        resolution: schema.complianceBreaches.resolution,
        created_at: schema.complianceBreaches.created_at,
        rule_type: schema.complianceRules.rule_type,
        rule_severity: schema.complianceRules.severity,
        rule_action: schema.complianceRules.action,
        rule_entity_type: schema.complianceRules.entity_type,
        rule_condition: schema.complianceRules.condition,
      })
      .from(schema.complianceBreaches)
      .leftJoin(
        schema.complianceRules,
        eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
      )
      .where(eq(schema.complianceBreaches.id, id))
      .limit(1);

    if (!breach) {
      throw new Error(`Compliance breach not found: ${id}`);
    }

    return breach;
  },

  // -------------------------------------------------------------------------
  // Resolve a breach
  // -------------------------------------------------------------------------
  async resolveBreach(id: number, resolution: string) {
    const [existing] = await db
      .select()
      .from(schema.complianceBreaches)
      .where(eq(schema.complianceBreaches.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Compliance breach not found: ${id}`);
    }

    if (existing.resolved_at) {
      throw new Error(`Compliance breach ${id} is already resolved`);
    }

    const [updated] = await db
      .update(schema.complianceBreaches)
      .set({
        resolved_at: new Date(),
        resolution,
        updated_at: new Date(),
      })
      .where(eq(schema.complianceBreaches.id, id))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // AML Alerts — flagged KYC cases
  // -------------------------------------------------------------------------
  async getAmlAlerts(filters: AmlAlertFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    // Flagged AML = KYC cases with REJECTED status or high-risk rating
    // indicating AML concern
    if (filters.riskRating) {
      conditions.push(eq(schema.kycCases.risk_rating, filters.riskRating));
    }

    // Filter for cases that represent AML flags: REJECTED status or HIGH risk
    conditions.push(
      sql`(${schema.kycCases.kyc_status} = 'REJECTED' OR ${schema.kycCases.risk_rating} = 'HIGH')` as any,
    );

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select({
        id: schema.kycCases.id,
        client_id: schema.kycCases.client_id,
        risk_rating: schema.kycCases.risk_rating,
        kyc_status: schema.kycCases.kyc_status,
        id_type: schema.kycCases.id_type,
        id_number: schema.kycCases.id_number,
        expiry_date: schema.kycCases.expiry_date,
        next_review_date: schema.kycCases.next_review_date,
        created_at: schema.kycCases.created_at,
        updated_at: schema.kycCases.updated_at,
      })
      .from(schema.kycCases)
      .where(where)
      .orderBy(desc(schema.kycCases.created_at))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.kycCases)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Trade Surveillance Alerts
  // -------------------------------------------------------------------------
  async getSurveillanceAlerts(filters: SurveillanceAlertFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.pattern) {
      conditions.push(
        eq(schema.tradeSurveillanceAlerts.pattern, filters.pattern as any),
      );
    }

    if (filters.disposition) {
      conditions.push(
        eq(schema.tradeSurveillanceAlerts.disposition, filters.disposition),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.tradeSurveillanceAlerts)
      .where(where)
      .orderBy(desc(schema.tradeSurveillanceAlerts.created_at))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tradeSurveillanceAlerts)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // STR Queue — Suspicious Transaction Reports awaiting filing
  // -------------------------------------------------------------------------
  async getStrQueue() {
    // STR candidates are unresolved breaches with HARD severity rules
    // combined with surveillance alerts that have no disposition yet
    const breachCandidates = await db
      .select({
        source: sql<string>`'BREACH'`,
        id: schema.complianceBreaches.id,
        description: schema.complianceBreaches.breach_description,
        portfolio_id: schema.complianceBreaches.portfolio_id,
        order_id: schema.complianceBreaches.order_id,
        detected_at: schema.complianceBreaches.detected_at,
        severity: schema.complianceRules.severity,
      })
      .from(schema.complianceBreaches)
      .leftJoin(
        schema.complianceRules,
        eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
      )
      .where(
        and(
          isNull(schema.complianceBreaches.resolved_at),
          eq(schema.complianceRules.severity, 'HARD'),
        ),
      )
      .orderBy(desc(schema.complianceBreaches.detected_at));

    const surveillanceCandidates = await db
      .select({
        source: sql<string>`'SURVEILLANCE'`,
        id: schema.tradeSurveillanceAlerts.id,
        pattern: schema.tradeSurveillanceAlerts.pattern,
        score: schema.tradeSurveillanceAlerts.score,
        order_ids: schema.tradeSurveillanceAlerts.order_ids,
        created_at: schema.tradeSurveillanceAlerts.created_at,
      })
      .from(schema.tradeSurveillanceAlerts)
      .where(isNull(schema.tradeSurveillanceAlerts.disposition))
      .orderBy(desc(schema.tradeSurveillanceAlerts.created_at));

    return {
      breaches: breachCandidates,
      surveillanceAlerts: surveillanceCandidates,
      totalPending: breachCandidates.length + surveillanceCandidates.length,
    };
  },

  // -------------------------------------------------------------------------
  // Compliance Health Score (0-100)
  // -------------------------------------------------------------------------
  async getComplianceScore() {
    // Count open breaches
    const [openBreachCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.complianceBreaches)
      .where(isNull(schema.complianceBreaches.resolved_at));
    const openBreaches = Number(openBreachCount?.count ?? 0);

    // Count AML alerts (high-risk / rejected KYC)
    const [amlAlertCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.kycCases)
      .where(
        sql`(${schema.kycCases.kyc_status} = 'REJECTED' OR ${schema.kycCases.risk_rating} = 'HIGH')`,
      );
    const openAmlAlerts = Number(amlAlertCount?.count ?? 0);

    // Count pending surveillance alerts (no disposition)
    const [surveillanceCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tradeSurveillanceAlerts)
      .where(isNull(schema.tradeSurveillanceAlerts.disposition));
    const pendingSurveillance = Number(surveillanceCount?.count ?? 0);

    // Count STR candidates (hard-severity unresolved breaches)
    const [strCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.complianceBreaches)
      .leftJoin(
        schema.complianceRules,
        eq(schema.complianceBreaches.rule_id, schema.complianceRules.id),
      )
      .where(
        and(
          isNull(schema.complianceBreaches.resolved_at),
          eq(schema.complianceRules.severity, 'HARD'),
        ),
      );
    const pendingStrs = Number(strCount?.count ?? 0);

    // Compute score: start at 100, deduct for each open issue
    // Breaches: -5 each (max -40)
    // AML alerts: -8 each (max -32)
    // Surveillance: -4 each (max -16)
    // STR pending: -6 each (max -12)
    const breachPenalty = Math.min(openBreaches * 5, 40);
    const amlPenalty = Math.min(openAmlAlerts * 8, 32);
    const surveillancePenalty = Math.min(pendingSurveillance * 4, 16);
    const strPenalty = Math.min(pendingStrs * 6, 12);

    const score = Math.max(
      0,
      100 - breachPenalty - amlPenalty - surveillancePenalty - strPenalty,
    );

    return {
      score,
      breakdown: {
        openBreaches,
        openAmlAlerts,
        pendingSurveillance,
        pendingStrs,
      },
      penalties: {
        breachPenalty,
        amlPenalty,
        surveillancePenalty,
        strPenalty,
      },
    };
  },
};
