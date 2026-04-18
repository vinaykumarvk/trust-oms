import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

interface ScreeningResult {
  hit: boolean;
  matches: Array<{
    name: string;
    list: string;
    score: number;
    reason: string;
  }>;
  screenedAt: string;
}

export const sanctionsService = {
  /** Screen a client -- stub returning mock results */
  async screenClient(clientId: string): Promise<ScreeningResult> {
    const client = await db.select().from(schema.clients)
      .where(eq(schema.clients.client_id, clientId)).limit(1);
    if (!client.length) throw new Error('Client not found');

    // STUB: In Phase 2, integrate with World-Check / Dow Jones
    // For now, always return no hit
    return {
      hit: false,
      matches: [],
      screenedAt: new Date().toISOString(),
    };
  },

  /** Screen a counterparty -- stub */
  async screenCounterparty(counterpartyId: number): Promise<ScreeningResult> {
    const cp = await db.select().from(schema.counterparties)
      .where(eq(schema.counterparties.id, counterpartyId)).limit(1);
    if (!cp.length) throw new Error('Counterparty not found');

    return {
      hit: false,
      matches: [],
      screenedAt: new Date().toISOString(),
    };
  },

  /** Re-screen all active clients -- stub */
  async rescreenAll(): Promise<{ total: number; hits: number }> {
    const activeClients = await db.select({ client_id: schema.clients.client_id })
      .from(schema.clients)
      .where(eq(schema.clients.is_deleted, false));

    // STUB: batch screening
    return { total: activeClients.length, hits: 0 };
  },
};
