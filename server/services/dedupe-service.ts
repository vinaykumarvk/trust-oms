/**
 * Deduplication Engine Service (CRM Phase 3)
 *
 * Configurable deduplication engine that checks incoming entity data against
 * existing leads, prospects, and clients using field-combination rules.
 * Supports SOFT_STOP (overridable) and HARD_STOP (blocking) classifications.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, asc } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

interface DedupeMatch {
  rule_id: number;
  stop_type: 'SOFT_STOP' | 'HARD_STOP';
  matched_entity_type: string;
  matched_entity_id: number | string;
  matched_fields: Record<string, string>;
}

interface DedupeResult {
  matches: DedupeMatch[];
  has_hard_stop: boolean;
  has_soft_stop: boolean;
}

interface EntityData {
  entity_type?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile_phone?: string;
  entity_name?: string;
  company_name?: string;
  date_of_birth?: string;
  nationality?: string;
  id_number?: string;
  [key: string]: unknown;
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).toLowerCase().trim();
}

/**
 * Extract the value of a field from entity data, supporting aliased field names
 * (e.g. "phone" maps to both "phone" and "mobile_phone").
 */
function getFieldValue(data: EntityData, field: string): string {
  if (field === 'phone') {
    return normalizeValue(data.phone || data.mobile_phone);
  }
  return normalizeValue(data[field]);
}

/**
 * Extract the value of a field from a DB row (lead/prospect/client).
 * Handles field name differences across tables.
 */
function getRowFieldValue(row: Record<string, unknown>, field: string): string {
  if (field === 'phone') {
    return normalizeValue(row.phone || row.mobile_phone || row.primary_contact_no);
  }
  if (field === 'entity_name') {
    return normalizeValue(row.entity_name || row.company_name || row.legal_name);
  }
  return normalizeValue(row[field]);
}

// ============================================================================
// Service
// ============================================================================

export const dedupeService = {
  /**
   * Check entity data against all active dedupe rules, scanning leads, prospects,
   * and clients for matching field combinations.
   */
  async checkDedupe(entityData: EntityData, entityType: string): Promise<DedupeResult> {
    const matches: DedupeMatch[] = [];

    // Load active rules ordered by priority (highest priority = lowest number first)
    const rules = await db
      .select()
      .from(schema.dedupeRules)
      .where(eq(schema.dedupeRules.is_active, true))
      .orderBy(asc(schema.dedupeRules.priority));

    // Determine person type from entity type
    const personType = entityType === 'NON_INDIVIDUAL' ? 'NON_INDIVIDUAL' : 'INDIVIDUAL';

    for (const rule of rules) {
      // Only apply rules matching the person type
      if (rule.person_type !== personType) continue;

      const fields = rule.field_combination as string[];
      if (!fields || !Array.isArray(fields) || fields.length === 0) continue;

      // Check if entity has all required fields populated
      const entityFieldValues: Record<string, string> = {};
      let hasAllFields = true;
      for (const field of fields) {
        const val = getFieldValue(entityData, field);
        if (!val) {
          hasAllFields = false;
          break;
        }
        entityFieldValues[field] = val;
      }
      if (!hasAllFields) continue;

      // Search leads
      const leadMatches = await findMatchesInTable(
        'leads',
        fields,
        entityFieldValues,
        rule,
      );
      matches.push(...leadMatches);

      // Search prospects
      const prospectMatches = await findMatchesInTable(
        'prospects',
        fields,
        entityFieldValues,
        rule,
      );
      matches.push(...prospectMatches);

      // Search clients
      const clientMatches = await findMatchesInClients(
        fields,
        entityFieldValues,
        rule,
      );
      matches.push(...clientMatches);
    }

    return {
      matches,
      has_hard_stop: matches.some((m) => m.stop_type === 'HARD_STOP'),
      has_soft_stop: matches.some((m) => m.stop_type === 'SOFT_STOP'),
    };
  },

  /**
   * Create a dedupe override record. Only allowed for SOFT_STOP rules.
   */
  async overrideDedupe(
    entityType: string,
    entityId: number,
    matchedEntityType: string,
    matchedEntityId: number,
    ruleId: number,
    reason: string,
    userId: number,
  ) {
    // Verify rule exists and is SOFT_STOP
    const [rule] = await db
      .select()
      .from(schema.dedupeRules)
      .where(eq(schema.dedupeRules.id, ruleId));

    if (!rule) {
      throw new Error('Dedupe rule not found');
    }
    if (rule.stop_type !== 'SOFT_STOP') {
      throw new Error('Only SOFT_STOP rules can be overridden');
    }

    const [override] = await db
      .insert(schema.dedupeOverrides)
      .values({
        entity_type: entityType,
        entity_id: entityId,
        matched_entity_type: matchedEntityType,
        matched_entity_id: matchedEntityId,
        rule_id: ruleId,
        override_reason: reason,
        override_user_id: userId,
        created_by: String(userId),
        updated_by: String(userId),
      })
      .returning();

    return override;
  },

  /**
   * List all active dedupe rules.
   */
  async getRules() {
    const rules = await db
      .select()
      .from(schema.dedupeRules)
      .where(eq(schema.dedupeRules.is_active, true))
      .orderBy(asc(schema.dedupeRules.priority));

    return rules;
  },

  /**
   * Create a new dedupe rule.
   */
  async createRule(data: {
    entity_type: 'INDIVIDUAL' | 'NON_INDIVIDUAL';
    person_type: string;
    field_combination: string[];
    stop_type: 'SOFT_STOP' | 'HARD_STOP';
    priority?: number;
    created_by?: string;
  }) {
    const [rule] = await db
      .insert(schema.dedupeRules)
      .values({
        entity_type: data.entity_type,
        person_type: data.person_type,
        field_combination: data.field_combination,
        stop_type: data.stop_type,
        priority: data.priority ?? 1,
        is_active: true,
        created_by: data.created_by || 'system',
        updated_by: data.created_by || 'system',
      })
      .returning();

    return rule;
  },

  /**
   * Update an existing dedupe rule.
   */
  async updateRule(
    id: number,
    data: Partial<{
      entity_type: 'INDIVIDUAL' | 'NON_INDIVIDUAL';
      person_type: string;
      field_combination: string[];
      stop_type: 'SOFT_STOP' | 'HARD_STOP';
      priority: number;
      updated_by: string;
    }>,
  ) {
    const [existing] = await db
      .select()
      .from(schema.dedupeRules)
      .where(eq(schema.dedupeRules.id, id));

    if (!existing) throw new Error('Dedupe rule not found');

    const [updated] = await db
      .update(schema.dedupeRules)
      .set({
        ...(data.entity_type !== undefined ? { entity_type: data.entity_type } : {}),
        ...(data.person_type !== undefined ? { person_type: data.person_type } : {}),
        ...(data.field_combination !== undefined ? { field_combination: data.field_combination } : {}),
        ...(data.stop_type !== undefined ? { stop_type: data.stop_type } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        updated_by: data.updated_by || 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.dedupeRules.id, id))
      .returning();

    return updated;
  },

  /**
   * Soft-delete a dedupe rule by setting is_active = false.
   */
  async deleteRule(id: number, userId?: string) {
    const [existing] = await db
      .select()
      .from(schema.dedupeRules)
      .where(eq(schema.dedupeRules.id, id));

    if (!existing) throw new Error('Dedupe rule not found');

    const [updated] = await db
      .update(schema.dedupeRules)
      .set({
        is_active: false,
        updated_by: userId || 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.dedupeRules.id, id))
      .returning();

    return updated;
  },
};

// ============================================================================
// Internal helpers — table scanning
// ============================================================================

async function findMatchesInTable(
  tableName: 'leads' | 'prospects',
  fields: string[],
  entityFieldValues: Record<string, string>,
  rule: { id: number; stop_type: string },
): Promise<DedupeMatch[]> {
  const matches: DedupeMatch[] = [];

  // Build WHERE conditions for each field
  const conditions: ReturnType<typeof eq>[] = [];
  const table = tableName === 'leads' ? schema.leads : schema.prospects;

  // Add is_deleted = false for leads (which have is_deleted via auditFields)
  // Both tables don't have explicit is_deleted but have deleted_at
  conditions.push(sql`${table}.deleted_at IS NULL` as any);

  for (const field of fields) {
    const value = entityFieldValues[field];
    if (field === 'first_name') {
      conditions.push(sql`LOWER(TRIM(${table.first_name})) = ${value}` as any);
    } else if (field === 'last_name') {
      conditions.push(sql`LOWER(TRIM(${table.last_name})) = ${value}` as any);
    } else if (field === 'email') {
      conditions.push(sql`LOWER(TRIM(${table.email})) = ${value}` as any);
    } else if (field === 'phone' || field === 'mobile_phone') {
      conditions.push(sql`LOWER(TRIM(${table.mobile_phone})) = ${value}` as any);
    } else if (field === 'entity_name') {
      if (tableName === 'leads') {
        conditions.push(
          sql`(LOWER(TRIM(${(table as typeof schema.leads).entity_name})) = ${value} OR LOWER(TRIM(${(table as typeof schema.leads).company_name})) = ${value})` as any,
        );
      } else {
        conditions.push(
          sql`LOWER(TRIM(${(table as typeof schema.prospects).company_name})) = ${value}` as any,
        );
      }
    } else if (field === 'date_of_birth') {
      conditions.push(sql`${table.date_of_birth} = ${entityFieldValues[field]}` as any);
    } else if (field === 'nationality') {
      conditions.push(sql`LOWER(TRIM(${table.nationality})) = ${value}` as any);
    }
  }

  if (conditions.length === 0) return matches;

  const rows = await db
    .select({
      id: table.id,
      first_name: table.first_name,
      last_name: table.last_name,
      email: table.email,
      mobile_phone: table.mobile_phone,
    })
    .from(table)
    .where(and(...conditions))
    .limit(50);

  for (const row of rows) {
    const matchedFields: Record<string, string> = {};
    for (const field of fields) {
      matchedFields[field] = getRowFieldValue(row as Record<string, unknown>, field);
    }
    matches.push({
      rule_id: rule.id,
      stop_type: rule.stop_type as 'SOFT_STOP' | 'HARD_STOP',
      matched_entity_type: tableName === 'leads' ? 'LEAD' : 'PROSPECT',
      matched_entity_id: row.id,
      matched_fields: matchedFields,
    });
  }

  return matches;
}

async function findMatchesInClients(
  fields: string[],
  entityFieldValues: Record<string, string>,
  rule: { id: number; stop_type: string },
): Promise<DedupeMatch[]> {
  const matches: DedupeMatch[] = [];

  // Build WHERE conditions for client table
  const conditions: ReturnType<typeof eq>[] = [];

  for (const field of fields) {
    const value = entityFieldValues[field];
    if (field === 'entity_name' || field === 'first_name' || field === 'last_name') {
      // Clients only have legal_name — match against it
      // For individual name parts, do substring matching against legal_name
      if (field === 'entity_name') {
        conditions.push(sql`LOWER(TRIM(${schema.clients.legal_name})) = ${value}` as any);
      } else if (field === 'first_name') {
        conditions.push(sql`LOWER(TRIM(${schema.clients.legal_name})) LIKE ${value + '%'}` as any);
      } else if (field === 'last_name') {
        conditions.push(sql`LOWER(TRIM(${schema.clients.legal_name})) LIKE ${'%' + value}` as any);
      }
    } else if (field === 'email') {
      // Clients store contact as JSONB — search within it
      conditions.push(sql`${schema.clients.contact}->>'email' = ${entityFieldValues[field]}` as any);
    } else if (field === 'phone' || field === 'mobile_phone') {
      conditions.push(sql`${schema.clients.contact}->>'phone' = ${entityFieldValues[field]}` as any);
    } else if (field === 'date_of_birth') {
      conditions.push(sql`${schema.clients.birth_date} = ${entityFieldValues[field]}` as any);
    }
  }

  if (conditions.length === 0) return matches;

  const rows = await db
    .select({
      client_id: schema.clients.client_id,
      legal_name: schema.clients.legal_name,
      contact: schema.clients.contact,
    })
    .from(schema.clients)
    .where(and(...conditions))
    .limit(50);

  for (const row of rows) {
    const matchedFields: Record<string, string> = {};
    for (const field of fields) {
      matchedFields[field] = getRowFieldValue(
        { ...row, ...(typeof row.contact === 'object' && row.contact !== null ? row.contact as Record<string, unknown> : {}) } as Record<string, unknown>,
        field,
      );
    }
    matches.push({
      rule_id: rule.id,
      stop_type: rule.stop_type as 'SOFT_STOP' | 'HARD_STOP',
      matched_entity_type: 'CLIENT',
      matched_entity_id: row.client_id,
      matched_fields: matchedFields,
    });
  }

  return matches;
}
