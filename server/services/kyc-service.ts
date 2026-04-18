import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, lte, gte, sql, type InferSelectModel } from 'drizzle-orm';

type KycCase = InferSelectModel<typeof schema.kycCases>;
type BeneficialOwner = InferSelectModel<typeof schema.beneficialOwners>;

export const kycService = {
  /** Create or initiate a new KYC case for a client */
  async initiateKyc(clientId: string, data: {
    risk_rating?: string;
    id_number?: string;
    id_type?: string;
    expiry_date?: string;
  }) {
    const refreshCadence = this.getRefreshCadence(data.risk_rating ?? 'MEDIUM');
    const nextReview = new Date();
    nextReview.setFullYear(nextReview.getFullYear() + refreshCadence);

    const [kycCase] = await db.insert(schema.kycCases).values({
      client_id: clientId,
      risk_rating: data.risk_rating ?? 'MEDIUM',
      kyc_status: 'PENDING',
      id_number: data.id_number,
      id_type: data.id_type,
      expiry_date: data.expiry_date,
      refresh_cadence_years: refreshCadence,
      next_review_date: nextReview.toISOString().split('T')[0],
    }).returning();

    return kycCase;
  },

  /** Update KYC case status */
  async updateKycStatus(caseId: number, status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'REJECTED') {
    const [updated] = await db.update(schema.kycCases)
      .set({ kyc_status: status, updated_at: new Date() })
      .where(eq(schema.kycCases.id, caseId))
      .returning();
    return updated;
  },

  /** Calculate risk rating based on client profile data */
  async calculateRiskRating(clientId: string): Promise<'LOW' | 'MEDIUM' | 'HIGH'> {
    // Fetch client + profile data
    const client = await db.select().from(schema.clients)
      .where(eq(schema.clients.client_id, clientId)).limit(1);
    if (!client.length) throw new Error('Client not found');

    const profiles = await db.select().from(schema.clientProfiles)
      .where(eq(schema.clientProfiles.client_id, clientId)).limit(1);

    // Auto-escalation rules per BRD:
    // HIGH if PEP, sanctions hit, or cash-intensive business
    const profile = profiles[0];
    if (profile?.source_of_wealth?.toLowerCase().includes('cash')) return 'HIGH';

    // Additional check: beneficial owners
    const ubos = await db.select().from(schema.beneficialOwners)
      .where(eq(schema.beneficialOwners.client_id, clientId));
    const hasUnverifiedUbo = ubos.some((u: BeneficialOwner) => !u.verified);
    if (hasUnverifiedUbo) return 'HIGH';

    // Default scoring based on type
    const clientType = client[0]?.type;
    if (clientType === 'INSTITUTIONAL') return 'MEDIUM';
    return 'LOW';
  },

  /** Get refresh cadence in years based on risk band */
  getRefreshCadence(riskBand: string): number {
    switch (riskBand?.toUpperCase()) {
      case 'HIGH': return 1;
      case 'MEDIUM': return 2;
      case 'LOW': return 3;
      default: return 2;
    }
  },

  /** Get KYC cases expiring within N days */
  async getExpiringKyc(daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const today = new Date().toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    return db.select().from(schema.kycCases)
      .where(and(
        lte(schema.kycCases.next_review_date, futureStr),
        gte(schema.kycCases.next_review_date, today),
        eq(schema.kycCases.kyc_status, 'VERIFIED'),
      ));
  },

  /** Get all expired KYC cases */
  async getExpiredKyc() {
    const today = new Date().toISOString().split('T')[0];
    return db.select().from(schema.kycCases)
      .where(and(
        lte(schema.kycCases.next_review_date, today),
        eq(schema.kycCases.kyc_status, 'VERIFIED'),
      ));
  },

  /** Bulk renewal -- reset next_review_date for multiple clients */
  async bulkRenewal(clientIds: string[]) {
    const results = [];
    for (const clientId of clientIds) {
      const cases = await db.select().from(schema.kycCases)
        .where(eq(schema.kycCases.client_id, clientId));
      for (const kycCase of cases) {
        const cadence = kycCase.refresh_cadence_years ?? 2;
        const nextReview = new Date();
        nextReview.setFullYear(nextReview.getFullYear() + cadence);
        await db.update(schema.kycCases)
          .set({
            next_review_date: nextReview.toISOString().split('T')[0],
            kyc_status: 'VERIFIED',
            updated_at: new Date(),
          })
          .where(eq(schema.kycCases.id, kycCase.id));
        results.push({ clientId, caseId: kycCase.id, nextReview: nextReview.toISOString().split('T')[0] });
      }
    }
    return results;
  },

  /** Get KYC history for a client */
  async getKycHistory(clientId: string) {
    return db.select().from(schema.kycCases)
      .where(eq(schema.kycCases.client_id, clientId))
      .orderBy(schema.kycCases.created_at);
  },

  /** Get KYC summary stats */
  async getSummary() {
    const allCases = await db.select().from(schema.kycCases);
    const total = allCases.length;
    const verified = allCases.filter((c: KycCase) => c.kyc_status === 'VERIFIED').length;
    const pending = allCases.filter((c: KycCase) => c.kyc_status === 'PENDING').length;
    const expired = allCases.filter((c: KycCase) => c.kyc_status === 'EXPIRED').length;
    const rejected = allCases.filter((c: KycCase) => c.kyc_status === 'REJECTED').length;

    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];
    const expiringIn30 = allCases.filter((c: KycCase) =>
      c.kyc_status === 'VERIFIED' &&
      c.next_review_date &&
      c.next_review_date >= today &&
      c.next_review_date <= thirtyDaysStr
    ).length;

    return { total, verified, pending, expired, rejected, expiringIn30 };
  },
};
