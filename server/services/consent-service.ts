import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export const consentService = {
  async grantConsent(data: {
    clientId: string;
    purpose: string;
    channelScope: string[];
    legalBasis: string;
    dpaRef: string;
  }) {
    const consentId = `CON-${Date.now()}`;
    const [result] = await db
      .insert(schema.consentRecords)
      .values({
        consent_id: consentId,
        client_id: data.clientId,
        purpose: data.purpose,
        channel_scope: data.channelScope,
        granted: true,
        granted_at: new Date(),
        legal_basis: data.legalBasis,
        dpa_ref: data.dpaRef,
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();
    return result;
  },

  async withdrawConsent(consentId: string) {
    await db
      .update(schema.consentRecords)
      .set({
        granted: false,
        withdrawn_at: new Date(),
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.consentRecords.consent_id, consentId));
    return { withdrawn: true };
  },

  async getClientConsents(clientId: string) {
    return db
      .select()
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.client_id, clientId),
          eq(schema.consentRecords.is_deleted, false),
        ),
      );
  },

  async checkConsent(clientId: string, purpose: string): Promise<boolean> {
    const consents = await db
      .select()
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.client_id, clientId),
          eq(schema.consentRecords.purpose, purpose as any),
          eq(schema.consentRecords.granted, true),
          eq(schema.consentRecords.is_deleted, false),
        ),
      );
    return consents.length > 0;
  },

  async requestErasure(clientId: string) {
    await db
      .update(schema.clients)
      .set({
        dpa_erasure_requested_at: new Date(),
        updated_by: 'dpo',
        updated_at: new Date(),
      })
      .where(eq(schema.clients.client_id, clientId));

    return { clientId, status: 'ERASURE_REQUESTED', deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
  },

  async processErasure(clientId: string) {
    // Check for regulatory retention conflicts before proceeding
    const conflicts = await this.detectRetentionConflict(clientId);
    if (conflicts.hasConflict) {
      throw new Error(
        `Erasure blocked: regulatory retention conflicts exist for client ${clientId}. ` +
        `Conflicts: ${conflicts.conflicts.map((c: { regulation: string }) => c.regulation).join(', ')}. ` +
        `Use detectRetentionConflict() for resolution options.`,
      );
    }

    const client = await db.select().from(schema.clients).where(eq(schema.clients.client_id, clientId));
    if (!client.length) throw new Error('Client not found');

    // Soft-delete PII fields (preserve for audit)
    await db
      .update(schema.clients)
      .set({
        legal_name: '[ERASED]',
        tin: null,
        address: null,
        contact: null,
        updated_by: 'dpo-erasure',
        updated_at: new Date(),
      })
      .where(eq(schema.clients.client_id, clientId));

    return { clientId, status: 'ERASED' };
  },

  async getErasureQueue() {
    const clients = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.is_deleted, false));

    const queue = clients
      .filter((c: typeof clients[number]) => c.dpa_erasure_requested_at !== null)
      .map((c: typeof clients[number]) => {
        const requestedAt = c.dpa_erasure_requested_at!;
        const deadline = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return {
          clientId: c.client_id,
          requestedAt: requestedAt.toISOString(),
          deadline: deadline.toISOString(),
          daysRemaining,
          overdue: daysRemaining < 0,
        };
      });

    return queue;
  },

  async initiateBreachNotification(breachDetails: {
    breach_type: string;
    affected_count: number;
    containment_log: string;
    remediation_plan: string;
  }) {
    const breachId = `BRN-${Date.now()}`;
    const now = new Date();
    const npcDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72-hour NPC deadline

    const [result] = await db
      .insert(schema.breachNotifications)
      .values({
        breach_id: breachId,
        breach_type: breachDetails.breach_type,
        detected_at: now,
        npc_deadline: npcDeadline,
        affected_count: breachDetails.affected_count,
        containment_log: breachDetails.containment_log,
        remediation_plan: breachDetails.remediation_plan,
        breach_status: 'DETECTED',
        created_by: 'dpo',
        updated_by: 'dpo',
      })
      .returning();

    return {
      ...result,
      npc_deadline_iso: npcDeadline.toISOString(),
      hours_remaining: 72,
    };
  },

  async getBreachNotifications(filters?: { status?: string }) {
    if (filters?.status) {
      return db
        .select()
        .from(schema.breachNotifications)
        .where(
          and(
            eq(schema.breachNotifications.breach_status, filters.status as any),
            eq(schema.breachNotifications.is_deleted, false),
          ),
        );
    }
    return db
      .select()
      .from(schema.breachNotifications)
      .where(eq(schema.breachNotifications.is_deleted, false));
  },

  async notifyNPC(breachId: string) {
    const now = new Date();
    const [result] = await db
      .update(schema.breachNotifications)
      .set({
        npc_notified_at: now,
        breach_status: 'NPC_NOTIFIED',
        updated_by: 'dpo',
        updated_at: now,
      })
      .where(eq(schema.breachNotifications.breach_id, breachId))
      .returning();

    if (!result) throw new Error(`Breach notification not found: ${breachId}`);

    const withinDeadline = result.npc_deadline ? now <= result.npc_deadline : false;
    return {
      breachId,
      npc_notified_at: now.toISOString(),
      within_72hr_deadline: withinDeadline,
    };
  },

  async detectRetentionConflict(clientId: string) {
    const conflicts: Array<{
      regulation: string;
      retention_years: number;
      reason: string;
      earliest_eligible_erasure: string;
    }> = [];
    const resolutionOptions: string[] = [];

    // Check for active portfolios
    const activePortfolios = await db
      .select()
      .from(schema.portfolios)
      .where(
        and(
          eq(schema.portfolios.client_id, clientId),
          eq(schema.portfolios.portfolio_status, 'ACTIVE'),
        ),
      );

    if (activePortfolios.length > 0) {
      conflicts.push({
        regulation: 'BSP Active Account',
        retention_years: 7,
        reason: `Client has ${activePortfolios.length} active portfolio(s). Must be closed before erasure.`,
        earliest_eligible_erasure: 'N/A — close portfolios first',
      });
      resolutionOptions.push('Close all active portfolios before requesting erasure');
    }

    // Check for tax events within BIR 10-year retention period
    const birCutoff = new Date();
    birCutoff.setFullYear(birCutoff.getFullYear() - 10);

    const recentTaxEvents = await db
      .select()
      .from(schema.taxEvents)
      .where(
        and(
          eq(schema.taxEvents.portfolio_id, sql`ANY(
            SELECT portfolio_id FROM portfolios WHERE client_id = ${clientId}
          )`),
          gte(schema.taxEvents.created_at, birCutoff),
        ),
      );

    if (recentTaxEvents.length > 0) {
      const oldestEvent = recentTaxEvents.reduce((oldest: typeof recentTaxEvents[number], evt: typeof recentTaxEvents[number]) =>
        evt.created_at < oldest.created_at ? evt : oldest,
      );
      const eligibleDate = new Date(oldestEvent.created_at);
      eligibleDate.setFullYear(eligibleDate.getFullYear() + 10);

      conflicts.push({
        regulation: 'BIR 10-Year Tax Record Retention',
        retention_years: 10,
        reason: `${recentTaxEvents.length} tax event(s) within 10-year retention window.`,
        earliest_eligible_erasure: eligibleDate.toISOString(),
      });
      resolutionOptions.push('Wait until BIR 10-year retention period expires, then re-request erasure');
    }

    // Check for compliance records within BSP 7-year retention period
    const bspCutoff = new Date();
    bspCutoff.setFullYear(bspCutoff.getFullYear() - 7);

    const recentComplianceBreaches = await db
      .select()
      .from(schema.complianceBreaches)
      .where(
        and(
          eq(schema.complianceBreaches.portfolio_id, sql`ANY(
            SELECT portfolio_id FROM portfolios WHERE client_id = ${clientId}
          )`),
          gte(schema.complianceBreaches.created_at, bspCutoff),
        ),
      );

    if (recentComplianceBreaches.length > 0) {
      const oldestRecord = recentComplianceBreaches.reduce((oldest: typeof recentComplianceBreaches[number], rec: typeof recentComplianceBreaches[number]) =>
        rec.created_at < oldest.created_at ? rec : oldest,
      );
      const eligibleDate = new Date(oldestRecord.created_at);
      eligibleDate.setFullYear(eligibleDate.getFullYear() + 7);

      conflicts.push({
        regulation: 'BSP 7-Year Compliance Record Retention',
        retention_years: 7,
        reason: `${recentComplianceBreaches.length} compliance record(s) within 7-year retention window.`,
        earliest_eligible_erasure: eligibleDate.toISOString(),
      });
      resolutionOptions.push('Wait until BSP 7-year retention period expires, then re-request erasure');
    }

    if (conflicts.length === 0) {
      resolutionOptions.push('No conflicts — erasure may proceed');
    }

    return {
      clientId,
      hasConflict: conflicts.length > 0,
      conflicts,
      resolutionOptions,
    };
  },

  async validatePurpose(clientId: string, purpose: string): Promise<boolean> {
    return this.checkConsent(clientId, purpose);
  },

  async requestStewardSignoff(datasetId: string) {
    const [result] = await db
      .insert(schema.stewardSignoffs)
      .values({
        dataset_id: datasetId,
        requested_at: new Date(),
        signoff_status: 'PENDING',
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();

    return result;
  },

  async signOff(datasetId: string, stewardId: string) {
    const now = new Date();
    const [result] = await db
      .update(schema.stewardSignoffs)
      .set({
        steward_id: stewardId,
        signed_off_at: now,
        signoff_status: 'APPROVED',
        updated_by: stewardId,
        updated_at: now,
      })
      .where(
        and(
          eq(schema.stewardSignoffs.dataset_id, datasetId),
          eq(schema.stewardSignoffs.signoff_status, 'PENDING'),
        ),
      )
      .returning();

    if (!result) throw new Error(`No pending sign-off found for dataset: ${datasetId}`);

    return result;
  },
};
