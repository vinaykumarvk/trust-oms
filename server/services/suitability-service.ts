import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, type InferSelectModel } from 'drizzle-orm';

type KycCase = InferSelectModel<typeof schema.kycCases>;

interface SuitabilityProfile {
  risk_tolerance: string;
  investment_horizon: string;
  knowledge_level: string;
  source_of_wealth: string;
  income: string;
  net_worth: string;
}

export const suitabilityService = {
  /** Capture / update suitability profile for a client */
  async captureSuitabilityProfile(clientId: string, answers: SuitabilityProfile) {
    // Check if profile exists
    const existing = await db.select().from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.client_id, clientId)).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(schema.clientProfiles)
        .set({
          risk_tolerance: answers.risk_tolerance,
          investment_horizon: answers.investment_horizon,
          knowledge_level: answers.knowledge_level,
          source_of_wealth: answers.source_of_wealth,
          income: answers.income,
          net_worth: answers.net_worth,
          updated_at: new Date(),
          version: (existing[0].version ?? 1) + 1,
        })
        .where(eq(schema.clientProfiles.client_id, clientId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.clientProfiles).values({
        client_id: clientId,
        ...answers,
      }).returning();
      return created;
    }
  },

  /** Score suitability from profile data */
  scoreSuitability(profile: SuitabilityProfile): 'CONSERVATIVE' | 'MODERATE' | 'BALANCED' | 'GROWTH' | 'AGGRESSIVE' {
    const riskMap: Record<string, number> = {
      'LOW': 1, 'MODERATE': 2, 'MEDIUM': 2, 'HIGH': 3, 'VERY_HIGH': 4,
    };
    const horizonMap: Record<string, number> = {
      'SHORT': 1, 'MEDIUM': 2, 'LONG': 3,
    };
    const knowledgeMap: Record<string, number> = {
      'BASIC': 1, 'INTERMEDIATE': 2, 'ADVANCED': 3, 'EXPERT': 4,
    };

    const score = (
      (riskMap[profile.risk_tolerance?.toUpperCase()] ?? 2) +
      (horizonMap[profile.investment_horizon?.toUpperCase()] ?? 2) +
      (knowledgeMap[profile.knowledge_level?.toUpperCase()] ?? 2)
    );

    if (score <= 4) return 'CONSERVATIVE';
    if (score <= 6) return 'MODERATE';
    if (score <= 8) return 'BALANCED';
    if (score <= 10) return 'GROWTH';
    return 'AGGRESSIVE';
  },

  /** Check order suitability against client profile */
  async checkOrderSuitability(orderId: string): Promise<{
    result: 'PASSED' | 'FAILED' | 'OVERRIDE_REQUIRED';
    reasons: string[];
  }> {
    const order = await db.select().from(schema.orders)
      .where(eq(schema.orders.order_id, orderId)).limit(1);
    if (!order.length) return { result: 'FAILED', reasons: ['Order not found'] };

    const portfolio = await db.select().from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, order[0].portfolio_id!)).limit(1);
    if (!portfolio.length) return { result: 'FAILED', reasons: ['Portfolio not found'] };

    const profile = await db.select().from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.client_id, portfolio[0].client_id!)).limit(1);
    if (!profile.length) return { result: 'FAILED', reasons: ['No suitability profile on file'] };

    const reasons: string[] = [];

    // Check client risk profile vs security risk
    const security = order[0].security_id
      ? await db.select().from(schema.securities)
        .where(eq(schema.securities.id, order[0].security_id)).limit(1)
      : [];

    if (security.length > 0) {
      const secAssetClass = security[0].asset_class?.toUpperCase() ?? '';
      const clientRisk = profile[0].risk_tolerance?.toUpperCase() ?? '';

      // High-risk assets for conservative clients
      if (['EQUITY', 'ALTERNATIVES', 'DERIVATIVES'].includes(secAssetClass) && clientRisk === 'LOW') {
        reasons.push(`Client risk tolerance (${clientRisk}) is too low for ${secAssetClass} investments`);
      }

      // Derivative check
      if (security[0].is_derivative && clientRisk !== 'HIGH' && clientRisk !== 'VERY_HIGH') {
        reasons.push('Derivative products require HIGH or VERY_HIGH risk tolerance');
      }
    }

    // Check KYC validity
    const kycCases = await db.select().from(schema.kycCases)
      .where(eq(schema.kycCases.client_id, portfolio[0].client_id!));
    const hasValidKyc = kycCases.some((k: KycCase) => k.kyc_status === 'VERIFIED');
    if (!hasValidKyc) {
      reasons.push('Client does not have a verified KYC on file');
    }

    if (reasons.length === 0) return { result: 'PASSED', reasons: [] };
    // If only KYC issue, fail hard. If only suitability mismatch, allow override.
    const hasKycIssue = reasons.some(r => r.includes('KYC'));
    if (hasKycIssue) return { result: 'FAILED', reasons };
    return { result: 'OVERRIDE_REQUIRED', reasons };
  },

  /** Get current suitability profile */
  async getCurrentProfile(clientId: string) {
    const profiles = await db.select().from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.client_id, clientId)).limit(1);
    return profiles[0] ?? null;
  },

  /** Get profile version history (uses audit trail) */
  async getProfileHistory(clientId: string) {
    // For now return the current profile; full audit history via audit_records
    const profile = await this.getCurrentProfile(clientId);
    return profile ? [profile] : [];
  },
};
