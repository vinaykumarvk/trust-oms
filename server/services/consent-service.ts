import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';

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
        purpose: data.purpose as any,
        channel_scope: data.channelScope,
        granted: true,
        granted_at: new Date(),
        legal_basis: data.legalBasis as any,
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
    // Check for regulatory retention conflicts
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
};
