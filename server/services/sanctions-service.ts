/**
 * Sanctions Screening Service (FR-SAN-001)
 *
 * Screens entities (clients, counterparties) against sanctions lists.
 * Uses an in-memory configurable sanctions list as placeholder for
 * World-Check / Dow Jones integration (Phase 2).
 *
 * Fuzzy matching uses bigram similarity (Dice coefficient).
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// In-memory sanctions list (placeholder for external provider integration)
// ---------------------------------------------------------------------------
interface SanctionsEntry {
  id: string;
  name: string;
  aliases: string[];
  list: string;
  country?: string;
  reason?: string;
}

const SANCTIONS_LIST: SanctionsEntry[] = [
  {
    id: 'OFAC-001',
    name: 'BLOCKED PERSON ALPHA',
    aliases: ['B.P. ALPHA', 'ALPHA BLOCKED'],
    list: 'OFAC-SDN',
    country: 'XX',
    reason: 'Sanctions evasion',
  },
  {
    id: 'OFAC-002',
    name: 'SANCTIONED ENTITY BRAVO',
    aliases: ['S.E. BRAVO', 'BRAVO SANCTIONED'],
    list: 'OFAC-SDN',
    country: 'YY',
    reason: 'Terrorism financing',
  },
  {
    id: 'UN-001',
    name: 'DESIGNATED INDIVIDUAL CHARLIE',
    aliases: ['D.I. CHARLIE'],
    list: 'UN-CONSOLIDATED',
    country: 'ZZ',
    reason: 'UN Security Council Resolution 1267',
  },
  {
    id: 'EU-001',
    name: 'RESTRICTED COMPANY DELTA',
    aliases: ['RC DELTA', 'DELTA RESTRICTED'],
    list: 'EU-SANCTIONS',
    country: 'XX',
    reason: 'EU restrictive measures',
  },
  {
    id: 'AMLC-001',
    name: 'FLAGGED PERSON ECHO',
    aliases: ['F.P. ECHO', 'ECHO FLAGGED'],
    list: 'AMLC-WATCHLIST',
    country: 'PH',
    reason: 'AMLC freeze order',
  },
];

// Configurable threshold (0.0 - 1.0). Matches at or above this score are hits.
const MATCH_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Fuzzy matching: Bigram (Dice coefficient) similarity
// ---------------------------------------------------------------------------
function bigrams(str: string): Set<string> {
  const s = str.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.substring(i, i + 2));
  }
  return set;
}

function diceCoefficient(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function bestMatch(name: string, entry: SanctionsEntry): number {
  const candidates = [entry.name, ...entry.aliases];
  let best = 0;
  for (const candidate of candidates) {
    const score = diceCoefficient(name, candidate);
    if (score > best) best = score;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MatchedEntry {
  sanctionsEntryId: string;
  matchedName: string;
  list: string;
  score: number;
  country?: string;
  reason?: string;
}

interface ScreeningResult {
  hit: boolean;
  matchScore: number;
  matchedEntries: MatchedEntry[];
  logId: number;
  screenedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const sanctionsService = {
  /**
   * Screen an entity (client or counterparty) against the sanctions list.
   * Performs fuzzy matching and logs the result to sanctionsScreeningLog.
   */
  async screenEntity(
    entityType: string,
    entityId: string,
    name: string,
  ): Promise<ScreeningResult> {
    // Validate entity exists based on type
    if (entityType === 'CLIENT') {
      const [client] = await db
        .select({ client_id: schema.clients.client_id })
        .from(schema.clients)
        .where(eq(schema.clients.client_id, entityId))
        .limit(1);
      if (!client) throw new Error(`Client '${entityId}' not found`);
    } else if (entityType === 'COUNTERPARTY') {
      const [cp] = await db
        .select({ id: schema.counterparties.id })
        .from(schema.counterparties)
        .where(eq(schema.counterparties.id, parseInt(entityId, 10)))
        .limit(1);
      if (!cp) throw new Error(`Counterparty '${entityId}' not found`);
    }
    // For other entity types, proceed without validation

    // Run fuzzy matching against the sanctions list
    const matchedEntries: MatchedEntry[] = [];
    let highestScore = 0;

    for (const entry of SANCTIONS_LIST) {
      const score = bestMatch(name, entry);
      if (score >= MATCH_THRESHOLD) {
        matchedEntries.push({
          sanctionsEntryId: entry.id,
          matchedName: entry.name,
          list: entry.list,
          score: Math.round(score * 10000) / 10000,
          country: entry.country,
          reason: entry.reason,
        });
      }
      if (score > highestScore) highestScore = score;
    }

    // Sort by score descending
    matchedEntries.sort((a, b) => b.score - a.score);

    const isHit = matchedEntries.length > 0;
    const screeningStatus = isHit ? 'HIT' : 'CLEAR';
    const now = new Date();

    // Persist to screening log
    const [logEntry] = await db
      .insert(schema.sanctionsScreeningLog)
      .values({
        entity_type: entityType,
        entity_id: entityId,
        provider: 'INTERNAL',
        screened_name: name,
        hit_count: matchedEntries.length,
        match_details: matchedEntries as any,
        screening_status: screeningStatus,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return {
      hit: isHit,
      matchScore: Math.round(highestScore * 10000) / 10000,
      matchedEntries,
      logId: logEntry.id,
      screenedAt: now.toISOString(),
    };
  },

  /**
   * Screen a client by ID (convenience wrapper).
   * Looks up the client's legal_name and delegates to screenEntity.
   */
  async screenClient(clientId: string): Promise<ScreeningResult> {
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId))
      .limit(1);
    if (!client) throw new Error('Client not found');

    return this.screenEntity('CLIENT', clientId, client.legal_name ?? clientId);
  },

  /**
   * Screen a counterparty by ID (convenience wrapper).
   */
  async screenCounterparty(counterpartyId: number): Promise<ScreeningResult> {
    const [cp] = await db
      .select()
      .from(schema.counterparties)
      .where(eq(schema.counterparties.id, counterpartyId))
      .limit(1);
    if (!cp) throw new Error('Counterparty not found');

    return this.screenEntity(
      'COUNTERPARTY',
      String(counterpartyId),
      cp.name ?? String(counterpartyId),
    );
  },

  /**
   * Resolve a screening hit (mark as FALSE_POSITIVE or TRUE_MATCH).
   */
  async resolveHit(
    logId: number,
    resolution: 'FALSE_POSITIVE' | 'TRUE_MATCH' | 'ESCALATED',
    resolvedBy: number,
    notes?: string,
  ) {
    const [existing] = await db
      .select()
      .from(schema.sanctionsScreeningLog)
      .where(eq(schema.sanctionsScreeningLog.id, logId))
      .limit(1);

    if (!existing) throw new Error(`Screening log entry ${logId} not found`);
    if (existing.screening_status === 'CLEAR') {
      throw new Error('Cannot resolve a CLEAR screening entry');
    }
    if (
      existing.screening_status === 'FALSE_POSITIVE' ||
      existing.screening_status === 'TRUE_MATCH'
    ) {
      throw new Error(
        `Screening entry already resolved as ${existing.screening_status}`,
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.sanctionsScreeningLog)
      .set({
        screening_status: resolution,
        resolved_by: resolvedBy,
        resolved_at: now,
        resolution_notes: notes ?? null,
        updated_at: now,
      })
      .where(eq(schema.sanctionsScreeningLog.id, logId))
      .returning();

    return updated;
  },

  /**
   * Re-screen all active clients. Returns a summary of results.
   */
  async rescreenAll(): Promise<{
    total: number;
    hits: number;
    clear: number;
    results: Array<{
      clientId: string;
      name: string;
      hit: boolean;
      matchScore: number;
      logId: number;
    }>;
  }> {
    const activeClients = await db
      .select({
        client_id: schema.clients.client_id,
        legal_name: schema.clients.legal_name,
      })
      .from(schema.clients)
      .where(eq(schema.clients.is_deleted, false));

    let hits = 0;
    let clear = 0;
    const results: Array<{
      clientId: string;
      name: string;
      hit: boolean;
      matchScore: number;
      logId: number;
    }> = [];

    for (const client of activeClients) {
      const screening = await this.screenEntity(
        'CLIENT',
        client.client_id,
        client.legal_name ?? client.client_id,
      );

      if (screening.hit) {
        hits++;
      } else {
        clear++;
      }

      results.push({
        clientId: client.client_id,
        name: client.legal_name ?? client.client_id,
        hit: screening.hit,
        matchScore: screening.matchScore,
        logId: screening.logId,
      });
    }

    return {
      total: activeClients.length,
      hits,
      clear,
      results,
    };
  },

  /**
   * Get a screening log entry by ID.
   */
  async getScreeningLog(logId: number) {
    const [entry] = await db
      .select()
      .from(schema.sanctionsScreeningLog)
      .where(eq(schema.sanctionsScreeningLog.id, logId))
      .limit(1);
    return entry ?? null;
  },

  /**
   * List screening log entries with pagination and filters.
   */
  async listScreeningLogs(params: {
    page?: number;
    pageSize?: number;
    entityType?: string;
    entityId?: string;
    status?: string;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 25, 1), 100);
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.sanctionsScreeningLog.is_deleted, false)];
    if (params.entityType) {
      conditions.push(
        eq(schema.sanctionsScreeningLog.entity_type, params.entityType),
      );
    }
    if (params.entityId) {
      conditions.push(
        eq(schema.sanctionsScreeningLog.entity_id, params.entityId),
      );
    }
    if (params.status) {
      conditions.push(
        eq(
          schema.sanctionsScreeningLog.screening_status,
          params.status as any,
        ),
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0];

    const data = await db
      .select()
      .from(schema.sanctionsScreeningLog)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.sanctionsScreeningLog.created_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.sanctionsScreeningLog)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },
};
