/**
 * Negative List Screening Service (CRM Phase 3)
 *
 * Screens entities against the negative_list table using:
 * - Exact matching on email, phone, id_number
 * - Fuzzy name matching using Levenshtein distance (application-level)
 * - CRUD operations and bulk upload for negative list entries
 *
 * Any match is treated as a hard-stop.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, or, ilike, sql, desc, isNull, gte } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

interface NegativeListMatch {
  list_type: string;
  matched_fields: Record<string, string>;
  confidence: number;
  entry_id: number;
}

interface ScreeningResult {
  matched: boolean;
  matches: NegativeListMatch[];
}

interface EntityData {
  first_name?: string;
  last_name?: string;
  entity_name?: string;
  email?: string;
  phone?: string;
  mobile_phone?: string;
  id_number?: string;
  id_type?: string;
  [key: string]: unknown;
}

interface NegativeListEntry {
  list_type: 'NEGATIVE' | 'BLACKLIST' | 'SANCTIONS' | 'PEP';
  first_name?: string;
  last_name?: string;
  entity_name?: string;
  email?: string;
  phone?: string;
  id_type?: string;
  id_number?: string;
  nationality?: string;
  date_of_birth?: string;
  reason?: string;
  source?: string;
  effective_date?: string;
  expiry_date?: string;
}

// ============================================================================
// Levenshtein Distance — Pure TypeScript Implementation
// ============================================================================

/**
 * Compute the Levenshtein distance between two strings.
 * Uses the classic dynamic programming approach with O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  // Ensure `a` is the shorter string for space optimization
  const shorter = aLower.length <= bLower.length ? aLower : bLower;
  const longer = aLower.length <= bLower.length ? bLower : aLower;

  // Use single-row DP: previous row values
  let prevRow = new Array(shorter.length + 1);
  for (let i = 0; i <= shorter.length; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= longer.length; j++) {
    const currRow = new Array(shorter.length + 1);
    currRow[0] = j;
    for (let i = 1; i <= shorter.length; i++) {
      const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,       // insertion
        prevRow[i] + 1,           // deletion
        prevRow[i - 1] + cost,    // substitution
      );
    }
    prevRow = currRow;
  }

  return prevRow[shorter.length];
}

// ============================================================================
// Helpers
// ============================================================================

function normalize(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).toLowerCase().trim();
}

// ============================================================================
// Service
// ============================================================================

export const negativeListService = {
  /**
   * Screen an entity against all active negative list entries.
   * Exact matching on email, phone, id_number.
   * Fuzzy name matching using Levenshtein distance (<= 2).
   */
  async screenEntity(entityData: EntityData): Promise<ScreeningResult> {
    const matches: NegativeListMatch[] = [];

    // Load active, non-expired negative list entries
    const today = new Date().toISOString().split('T')[0];
    const entries = await db
      .select()
      .from(schema.negativeList)
      .where(and(
        eq(schema.negativeList.is_active, true),
        or(
          isNull(schema.negativeList.expiry_date),
          gte(schema.negativeList.expiry_date, today),
        ),
      ));

    const entityEmail = normalize(entityData.email);
    const entityPhone = normalize(entityData.phone || entityData.mobile_phone);
    const entityIdNumber = normalize(entityData.id_number);
    const entityFirstName = normalize(entityData.first_name);
    const entityLastName = normalize(entityData.last_name);
    const entityFullName = [entityFirstName, entityLastName].filter(Boolean).join(' ');
    const entityEntityName = normalize(entityData.entity_name);

    for (const entry of entries) {
      const matchedFields: Record<string, string> = {};
      let confidence = 0;
      let isMatch = false;

      // Exact match: email
      if (entityEmail && entry.email) {
        const entryEmail = normalize(entry.email);
        if (entityEmail === entryEmail) {
          matchedFields.email = entryEmail;
          confidence = 1.0;
          isMatch = true;
        }
      }

      // Exact match: phone
      if (entityPhone && entry.phone) {
        const entryPhone = normalize(entry.phone);
        if (entityPhone === entryPhone) {
          matchedFields.phone = entryPhone;
          confidence = 1.0;
          isMatch = true;
        }
      }

      // Exact match: id_number
      if (entityIdNumber && entry.id_number) {
        const entryIdNumber = normalize(entry.id_number);
        if (entityIdNumber === entryIdNumber) {
          matchedFields.id_number = entryIdNumber;
          confidence = 1.0;
          isMatch = true;
        }
      }

      // Fuzzy name matching: first_name + last_name
      if ((entityFirstName || entityLastName) && (entry.first_name || entry.last_name)) {
        const entryFirstName = normalize(entry.first_name);
        const entryLastName = normalize(entry.last_name);
        const entryFullName = [entryFirstName, entryLastName].filter(Boolean).join(' ');

        if (entityFullName && entryFullName) {
          const distance = levenshteinDistance(entityFullName, entryFullName);
          if (distance <= 2) {
            matchedFields.name = entryFullName;
            // Confidence: 1.0 for exact, 0.9 for distance 1, 0.8 for distance 2
            const nameConfidence = distance === 0 ? 1.0 : distance === 1 ? 0.9 : 0.8;
            confidence = Math.max(confidence, nameConfidence);
            isMatch = true;
          }
        }
      }

      // Fuzzy name matching: entity_name
      if (entityEntityName && entry.entity_name) {
        const entryEntityName = normalize(entry.entity_name);
        if (entityEntityName && entryEntityName) {
          const distance = levenshteinDistance(entityEntityName, entryEntityName);
          if (distance <= 2) {
            matchedFields.entity_name = entryEntityName;
            const nameConfidence = distance === 0 ? 1.0 : distance === 1 ? 0.9 : 0.8;
            confidence = Math.max(confidence, nameConfidence);
            isMatch = true;
          }
        }
      }

      if (isMatch) {
        matches.push({
          list_type: entry.list_type,
          matched_fields: matchedFields,
          confidence,
          entry_id: entry.id,
        });
      }
    }

    return {
      matched: matches.length > 0,
      matches,
    };
  },

  /**
   * Create a new negative list entry.
   */
  async create(data: NegativeListEntry & { created_by?: string }) {
    const [entry] = await db
      .insert(schema.negativeList)
      .values({
        list_type: data.list_type,
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        entity_name: data.entity_name || null,
        email: data.email || null,
        phone: data.phone || null,
        id_type: data.id_type || null,
        id_number: data.id_number || null,
        nationality: data.nationality || null,
        date_of_birth: data.date_of_birth || null,
        reason: data.reason || null,
        source: data.source || null,
        effective_date: data.effective_date || null,
        expiry_date: data.expiry_date || null,
        is_active: true,
        created_by: data.created_by || 'system',
        updated_by: data.created_by || 'system',
      })
      .returning();

    return entry;
  },

  /**
   * Update an existing negative list entry.
   */
  async update(id: number, data: Partial<NegativeListEntry> & { updated_by?: string }) {
    const [existing] = await db
      .select()
      .from(schema.negativeList)
      .where(eq(schema.negativeList.id, id));

    if (!existing) throw new Error('Negative list entry not found');

    const [updated] = await db
      .update(schema.negativeList)
      .set({
        ...(data.list_type !== undefined ? { list_type: data.list_type } : {}),
        ...(data.first_name !== undefined ? { first_name: data.first_name } : {}),
        ...(data.last_name !== undefined ? { last_name: data.last_name } : {}),
        ...(data.entity_name !== undefined ? { entity_name: data.entity_name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.id_type !== undefined ? { id_type: data.id_type } : {}),
        ...(data.id_number !== undefined ? { id_number: data.id_number } : {}),
        ...(data.nationality !== undefined ? { nationality: data.nationality } : {}),
        ...(data.date_of_birth !== undefined ? { date_of_birth: data.date_of_birth } : {}),
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.effective_date !== undefined ? { effective_date: data.effective_date } : {}),
        ...(data.expiry_date !== undefined ? { expiry_date: data.expiry_date } : {}),
        updated_by: data.updated_by || 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.negativeList.id, id))
      .returning();

    return updated;
  },

  /**
   * Soft-delete (deactivate) a negative list entry.
   */
  async deactivate(id: number, userId?: string) {
    const [existing] = await db
      .select()
      .from(schema.negativeList)
      .where(eq(schema.negativeList.id, id));

    if (!existing) throw new Error('Negative list entry not found');

    const [updated] = await db
      .update(schema.negativeList)
      .set({
        is_active: false,
        updated_by: userId || 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.negativeList.id, id))
      .returning();

    return updated;
  },

  /**
   * List negative list entries with optional filters.
   */
  async list(filters?: {
    type?: string;
    status?: 'active' | 'inactive';
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.type) {
      conditions.push(eq(schema.negativeList.list_type, filters.type as any));
    }
    if (filters?.status === 'active') {
      conditions.push(eq(schema.negativeList.is_active, true));
    } else if (filters?.status === 'inactive') {
      conditions.push(eq(schema.negativeList.is_active, false));
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(schema.negativeList.first_name, searchTerm),
          ilike(schema.negativeList.last_name, searchTerm),
          ilike(schema.negativeList.entity_name, searchTerm),
          ilike(schema.negativeList.email, searchTerm),
          ilike(schema.negativeList.phone, searchTerm),
          ilike(schema.negativeList.id_number, searchTerm),
        ) as any,
      );
    }

    const query = db
      .select()
      .from(schema.negativeList)
      .orderBy(desc(schema.negativeList.created_at));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = whereClause
      ? await query.where(whereClause).limit(filters?.limit || 100).offset(filters?.offset || 0)
      : await query.limit(filters?.limit || 100).offset(filters?.offset || 0);

    return rows;
  },

  /**
   * Bulk upload negative list entries from parsed CSV data.
   */
  async bulkUpload(
    records: NegativeListEntry[],
    userId?: string,
  ): Promise<{ imported: number; errors: number; details: Array<{ row: number; error: string }> }> {
    let imported = 0;
    let errors = 0;
    const details: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // Validate required fields
      if (!record.list_type) {
        errors++;
        details.push({ row: i + 1, error: 'list_type is required' });
        continue;
      }

      const validTypes = ['NEGATIVE', 'BLACKLIST', 'SANCTIONS', 'PEP'];
      if (!validTypes.includes(record.list_type)) {
        errors++;
        details.push({ row: i + 1, error: `Invalid list_type: ${record.list_type}` });
        continue;
      }

      // Must have at least one identifying field
      const hasIdentifier = record.first_name || record.last_name || record.entity_name ||
        record.email || record.phone || record.id_number;
      if (!hasIdentifier) {
        errors++;
        details.push({ row: i + 1, error: 'At least one identifying field is required' });
        continue;
      }

      try {
        await db
          .insert(schema.negativeList)
          .values({
            list_type: record.list_type,
            first_name: record.first_name || null,
            last_name: record.last_name || null,
            entity_name: record.entity_name || null,
            email: record.email || null,
            phone: record.phone || null,
            id_type: record.id_type || null,
            id_number: record.id_number || null,
            nationality: record.nationality || null,
            date_of_birth: record.date_of_birth || null,
            reason: record.reason || null,
            source: record.source || null,
            effective_date: record.effective_date || null,
            expiry_date: record.expiry_date || null,
            is_active: true,
            created_by: userId || 'system',
            updated_by: userId || 'system',
          });
        imported++;
      } catch (err) {
        errors++;
        details.push({ row: i + 1, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { imported, errors, details };
  },
};
