/**
 * Lead Rule Engine Service
 *
 * Manages lead rules with recursive criteria JSON evaluation.
 * Supports AND/OR/NOT operators and field conditions:
 *   EQ, GT, LT, GTE, LTE, CONTAINS, IN, BETWEEN
 *
 * Max 5 nesting levels, max 20 conditions total.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, count, gt, lt, gte, lte, or } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

interface FieldCondition {
  field: string;
  // BRD G-007: invert variants (NOT_EQ, NOT_IN, NOT_CONTAINS) allow negation at the field level
  op: 'EQ' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'CONTAINS' | 'IN' | 'BETWEEN' | 'NOT_EQ' | 'NOT_IN' | 'NOT_CONTAINS';
  value: unknown;
}

interface GroupCondition {
  operator: 'AND' | 'OR' | 'NOT';
  conditions: CriteriaNode[];
}

type CriteriaNode = FieldCondition | GroupCondition;

function isGroupCondition(node: CriteriaNode): node is GroupCondition {
  return 'operator' in node && 'conditions' in node;
}

// ============================================================================
// Validation
// ============================================================================

const MAX_NESTING_DEPTH = 5;
const MAX_CONDITIONS = 10; // BRD G-003: max 10 conditions per rule

function validateCriteria(node: CriteriaNode, depth: number = 1): { valid: boolean; error?: string; conditionCount: number } {
  if (depth > MAX_NESTING_DEPTH) {
    return { valid: false, error: `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded`, conditionCount: 0 };
  }

  if (isGroupCondition(node)) {
    if (!['AND', 'OR', 'NOT'].includes(node.operator)) {
      return { valid: false, error: `Invalid operator: ${node.operator}`, conditionCount: 0 };
    }
    if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
      return { valid: false, error: 'Group condition must have at least one child condition', conditionCount: 0 };
    }
    if (node.operator === 'NOT' && node.conditions.length !== 1) {
      return { valid: false, error: 'NOT operator must have exactly one child condition', conditionCount: 0 };
    }

    let totalCount = 0;
    for (const child of node.conditions) {
      const childResult = validateCriteria(child, depth + 1);
      if (!childResult.valid) return childResult;
      totalCount += childResult.conditionCount;
    }

    if (totalCount > MAX_CONDITIONS) {
      return { valid: false, error: `Maximum of ${MAX_CONDITIONS} conditions exceeded (found ${totalCount})`, conditionCount: totalCount };
    }
    return { valid: true, conditionCount: totalCount };
  }

  // Field condition
  const fieldCond = node as FieldCondition;
  if (!fieldCond.field || !fieldCond.op) {
    return { valid: false, error: 'Field condition must have field and op properties', conditionCount: 0 };
  }
  const validOps = ['EQ', 'GT', 'LT', 'GTE', 'LTE', 'CONTAINS', 'IN', 'BETWEEN', 'NOT_EQ', 'NOT_IN', 'NOT_CONTAINS'];
  if (!validOps.includes(fieldCond.op)) {
    return { valid: false, error: `Invalid operator: ${fieldCond.op}. Must be one of: ${validOps.join(', ')}`, conditionCount: 0 };
  }
  if (fieldCond.op === 'BETWEEN' && (!Array.isArray(fieldCond.value) || fieldCond.value.length !== 2)) {
    return { valid: false, error: 'BETWEEN operator requires a 2-element array value', conditionCount: 0 };
  }
  if ((fieldCond.op === 'IN' || fieldCond.op === 'NOT_IN') && !Array.isArray(fieldCond.value)) {
    return { valid: false, error: `${fieldCond.op} operator requires an array value`, conditionCount: 0 };
  }
  return { valid: true, conditionCount: 1 };
}

// ============================================================================
// Criteria Evaluation (in-memory against client/lead rows)
// ============================================================================

function evaluateFieldCondition(cond: FieldCondition, record: Record<string, unknown>): boolean {
  const fieldValue = record[cond.field];
  if (fieldValue === undefined || fieldValue === null) {
    // Null fields do not match any condition except explicit null checks
    return false;
  }

  const numericVal = Number(fieldValue);
  const strVal = String(fieldValue).toLowerCase();

  switch (cond.op) {
    case 'EQ':
      return strVal === String(cond.value).toLowerCase();

    case 'GT':
      return !isNaN(numericVal) && numericVal > Number(cond.value);

    case 'LT':
      return !isNaN(numericVal) && numericVal < Number(cond.value);

    case 'GTE':
      return !isNaN(numericVal) && numericVal >= Number(cond.value);

    case 'LTE':
      return !isNaN(numericVal) && numericVal <= Number(cond.value);

    case 'CONTAINS':
      return strVal.includes(String(cond.value).toLowerCase());

    case 'IN': {
      const inValues = (cond.value as unknown[]).map((v) => String(v).toLowerCase());
      return inValues.includes(strVal);
    }

    case 'BETWEEN': {
      const [lo, hi] = cond.value as [unknown, unknown];
      return !isNaN(numericVal) && numericVal >= Number(lo) && numericVal <= Number(hi);
    }

    // BRD G-007: invert operators
    case 'NOT_EQ':
      return strVal !== String(cond.value).toLowerCase();

    case 'NOT_IN': {
      const notInValues = (cond.value as unknown[]).map((v) => String(v).toLowerCase());
      return !notInValues.includes(strVal);
    }

    case 'NOT_CONTAINS':
      return !strVal.includes(String(cond.value).toLowerCase());

    default:
      return false;
  }
}

// ============================================================================
// G-008: Human-readable criteria preview builder
// ============================================================================

const OP_LABELS: Record<string, string> = {
  EQ: '=', GT: '>', LT: '<', GTE: '>=', LTE: '<=',
  CONTAINS: 'contains', IN: 'in', BETWEEN: 'between',
  NOT_EQ: '!=', NOT_IN: 'not in', NOT_CONTAINS: 'does not contain',
};

function buildCriteriaPreview(node: CriteriaNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  if (isGroupCondition(node)) {
    const childPreviews = node.conditions.map((c) => buildCriteriaPreview(c, depth + 1));
    if (node.operator === 'NOT') {
      return `${indent}NOT (\n${childPreviews[0]}\n${indent})`;
    }
    return `${indent}(\n${childPreviews.join(`\n${indent}  ${node.operator}\n`)}\n${indent})`;
  }
  const fc = node as FieldCondition;
  const opLabel = OP_LABELS[fc.op] ?? fc.op;
  const valLabel = Array.isArray(fc.value) ? `[${(fc.value as unknown[]).join(', ')}]` : String(fc.value);
  return `${indent}${fc.field} ${opLabel} ${valLabel}`;
}

function evaluateNode(node: CriteriaNode, record: Record<string, unknown>): boolean {
  if (isGroupCondition(node)) {
    switch (node.operator) {
      case 'AND':
        return node.conditions.every((child) => evaluateNode(child, record));
      case 'OR':
        return node.conditions.some((child) => evaluateNode(child, record));
      case 'NOT':
        return !evaluateNode(node.conditions[0], record);
      default:
        return false;
    }
  }

  return evaluateFieldCondition(node as FieldCondition, record);
}

// ============================================================================
// Data Fetching — get all candidate records for evaluation
// ============================================================================

async function fetchCandidateRecords(): Promise<Record<string, unknown>[]> {
  // B-005: Extended field set — join clientProfiles, assigned RM branch, and address country
  const clients = await db
    .select({
      client_id: schema.clients.client_id,
      legal_name: schema.clients.legal_name,
      client_category: schema.clients.type,
      client_status: schema.clients.client_status,
      risk_profile: schema.clients.risk_profile,
      assigned_rm_id: schema.clients.assigned_rm_id,
      address: schema.clients.address,
      total_aum: schema.portfolios.aum,
      // clientProfiles enrichment
      income: schema.clientProfiles.income,
      net_worth: schema.clientProfiles.net_worth,
      risk_tolerance: schema.clientProfiles.risk_tolerance,
      investment_horizon: schema.clientProfiles.investment_horizon,
      knowledge_level: schema.clientProfiles.knowledge_level,
      source_of_wealth: schema.clientProfiles.source_of_wealth,
      // B-005: branch from RM user record
      branch_id: schema.users.branch_id,
    })
    .from(schema.clients)
    .leftJoin(schema.portfolios, eq(schema.clients.client_id, schema.portfolios.client_id))
    .leftJoin(schema.clientProfiles, eq(schema.clients.client_id, schema.clientProfiles.client_id))
    .leftJoin(schema.users, eq(schema.clients.assigned_rm_id, schema.users.id))
    .where(eq(schema.clients.is_deleted, false))
    .limit(100000); // G-010: BRD requires 100,000 customer base evaluation

  return clients.map((c: any) => ({
    client_id: c.client_id,
    legal_name: c.legal_name,
    client_category: c.client_category,
    client_status: c.client_status,
    risk_profile: c.risk_profile,
    assigned_rm_id: c.assigned_rm_id,
    total_aum: c.total_aum ? Number(c.total_aum) : null,
    income: c.income ? Number(c.income) : null,
    net_worth: c.net_worth ? Number(c.net_worth) : null,
    risk_tolerance: c.risk_tolerance,
    investment_horizon: c.investment_horizon,
    knowledge_level: c.knowledge_level,
    source_of_wealth: c.source_of_wealth,
    // B-005: branch_id and country for segment targeting
    branch_id: c.branch_id ?? null,
    country: (c.address as Record<string, unknown> | null)?.country ?? null,
  }));
}

// ============================================================================
// Lead Code Generation Helper
// ============================================================================

async function generateLeadCode(): Promise<string> {
  const result = await db.execute(sql`SELECT lead_code FROM leads WHERE lead_code LIKE 'L-%' ORDER BY lead_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).lead_code;
    const lastSeq = parseInt(lastCode.replace('L-', ''), 10);
    nextSeq = lastSeq + 1;
  }
  return `L-${String(nextSeq).padStart(8, '0')}`;
}

async function generateListCode(): Promise<string> {
  const now = new Date();
  const dateSegment = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pattern = `LL-${dateSegment}-%`;
  const result = await db.execute(sql`SELECT list_code FROM lead_lists WHERE list_code LIKE ${pattern} ORDER BY list_code DESC LIMIT 1`);
  let nextSeq = 1;
  if (result.rows && result.rows.length > 0) {
    const lastCode = (result.rows[0] as Record<string, string>).list_code;
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10);
    nextSeq = lastSeq + 1;
  }
  return `LL-${dateSegment}-${String(nextSeq).padStart(4, '0')}`;
}

function computeDedupHash(firstName: string, lastName: string): string {
  const crypto = require('crypto');
  const normalized = [
    (firstName || '').toLowerCase().trim(),
    (lastName || '').toLowerCase().trim(),
    '',
    '',
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ============================================================================
// Service
// ============================================================================

export const leadRuleService = {
  /**
   * List all active lead rules.
   */
  async getRules() {
    return db
      .select()
      .from(schema.leadRules)
      .where(eq(schema.leadRules.is_active, true))
      .orderBy(schema.leadRules.id);
  },

  /**
   * Create a new lead rule.
   */
  async createRule(data: { rule_name: string; criteria_name?: string; criteria_json: CriteriaNode }, userId: string) {
    const validation = validateCriteria(data.criteria_json);
    if (!validation.valid) {
      throw new Error(`Invalid criteria: ${validation.error}`);
    }

    // BRD LP-006: criteria_name must be unique (when provided)
    if (data.criteria_name) {
      const [dup] = await db
        .select({ id: schema.leadRules.id })
        .from(schema.leadRules)
        .where(eq(schema.leadRules.criteria_name, data.criteria_name))
        .limit(1);
      if (dup) throw new Error(`A rule with criteria_name "${data.criteria_name}" already exists`);
    }

    const [rule] = await db
      .insert(schema.leadRules)
      .values({
        rule_name: data.rule_name,
        criteria_name: data.criteria_name || null,
        criteria_json: data.criteria_json,
        is_active: true,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return rule;
  },

  /**
   * Update an existing lead rule.
   */
  async updateRule(id: number, data: { rule_name?: string; criteria_name?: string; criteria_json?: CriteriaNode }, userId: string) {
    const [existing] = await db
      .select()
      .from(schema.leadRules)
      .where(eq(schema.leadRules.id, id));
    if (!existing) throw new Error('Lead rule not found');

    if (data.criteria_json) {
      const validation = validateCriteria(data.criteria_json);
      if (!validation.valid) {
        throw new Error(`Invalid criteria: ${validation.error}`);
      }
    }

    const updateFields: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date(),
    };
    if (data.rule_name !== undefined) updateFields.rule_name = data.rule_name;
    if (data.criteria_name !== undefined) updateFields.criteria_name = data.criteria_name;
    if (data.criteria_json !== undefined) updateFields.criteria_json = data.criteria_json;

    const [updated] = await db
      .update(schema.leadRules)
      .set(updateFields)
      .where(eq(schema.leadRules.id, id))
      .returning();

    return updated;
  },

  /**
   * Soft-delete a lead rule (set is_active = false).
   */
  async deleteRule(id: number, userId: string) {
    const [existing] = await db
      .select()
      .from(schema.leadRules)
      .where(eq(schema.leadRules.id, id));
    if (!existing) throw new Error('Lead rule not found');

    const [updated] = await db
      .update(schema.leadRules)
      .set({
        is_active: false,
        updated_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.leadRules.id, id))
      .returning();

    return updated;
  },

  /**
   * Evaluate criteria JSON tree against clients/leads.
   * Returns matching records.
   */
  async evaluateCriteria(criteriaJson: CriteriaNode): Promise<Record<string, unknown>[]> {
    const validation = validateCriteria(criteriaJson);
    if (!validation.valid) {
      throw new Error(`Invalid criteria: ${validation.error}`);
    }

    const candidates = await fetchCandidateRecords();
    return candidates.filter((record) => evaluateNode(criteriaJson, record));
  },

  /**
   * Dry-run preview: evaluate criteria and return count only.
   */
  async previewMatchCount(criteriaJson: CriteriaNode): Promise<{ count: number }> {
    const matches = await this.evaluateCriteria(criteriaJson);
    return { count: matches.length };
  },

  /**
   * G-008: Return human-readable expression preview for a criteria JSON tree.
   */
  getCriteriaPreview(criteriaJson: CriteriaNode): { preview: string } {
    const validation = validateCriteria(criteriaJson);
    if (!validation.valid) {
      throw new Error(`Invalid criteria: ${validation.error}`);
    }
    return { preview: buildCriteriaPreview(criteriaJson) };
  },

  /**
   * Execute criteria for a rule, create/update lead_list with source_type=RULE_BASED.
   */
  async generateList(ruleId: number, userId: string) {
    const [rule] = await db
      .select()
      .from(schema.leadRules)
      .where(eq(schema.leadRules.id, ruleId));
    if (!rule) throw new Error('Lead rule not found');
    if (!rule.is_active) throw new Error('Lead rule is inactive');

    const criteriaJson = rule.criteria_json as CriteriaNode;
    const matches = await this.evaluateCriteria(criteriaJson);

    // Create a new lead list for this rule
    const [leadList] = await db
      .insert(schema.leadLists)
      .values({
        list_code: await generateListCode(),
        name: `${rule.rule_name} - Generated ${new Date().toISOString().split('T')[0]}`,
        description: `Auto-generated from rule: ${rule.rule_name}`,
        source_type: 'RULE_BASED',
        source_rule_id: ruleId,
        rule_definition: criteriaJson,
        total_count: 0,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    // Create leads from matched clients and add to list
    let addedCount = 0;
    for (const match of matches) {
      const names = (String(match.legal_name || 'Unknown')).split(' ');
      const firstName = names[0] || 'Unknown';
      const lastName = names.slice(1).join(' ') || 'Unknown';
      const dedupHash = computeDedupHash(firstName, lastName);

      // Check for existing lead by dedup hash
      const existing = await db
        .select({ id: schema.leads.id })
        .from(schema.leads)
        .where(eq(schema.leads.dedup_hash, dedupHash))
        .limit(1);

      let leadId: number;
      if (existing.length > 0) {
        leadId = existing[0].id;
      } else {
        const [newLead] = await db
          .insert(schema.leads)
          .values({
            lead_code: await generateLeadCode(),
            entity_type: 'INDIVIDUAL',
            first_name: firstName,
            last_name: lastName,
            source: 'SYSTEM_GENERATED',
            lead_status: 'NEW',
            client_category: match.client_category as string,
            total_aum: match.total_aum != null ? String(match.total_aum) : null,
            risk_profile: match.risk_profile as string,
            dedup_hash: dedupHash,
            existing_client_id: match.client_id as string,
            created_by: 'system',
            updated_by: 'system',
          })
          .returning();
        leadId = newLead.id;
      }

      // Add to list (skip if already a member)
      const memberExists = await db
        .select({ id: schema.leadListMembers.id })
        .from(schema.leadListMembers)
        .where(and(
          eq(schema.leadListMembers.lead_list_id, leadList.id),
          eq(schema.leadListMembers.lead_id, leadId),
        ))
        .limit(1);

      if (memberExists.length === 0) {
        await db.insert(schema.leadListMembers).values({
          lead_list_id: leadList.id,
          lead_id: leadId,
          added_by: userId,
        });
        addedCount++;
      }
    }

    // Update list count
    await db
      .update(schema.leadLists)
      .set({ total_count: addedCount, updated_at: new Date() })
      .where(eq(schema.leadLists.id, leadList.id));

    // Update rule last_generated metadata
    await db
      .update(schema.leadRules)
      .set({
        last_generated_at: new Date(),
        last_generated_count: addedCount,
        updated_at: new Date(),
      })
      .where(eq(schema.leadRules.id, ruleId));

    return {
      rule_id: ruleId,
      list_id: leadList.id,
      list_code: leadList.list_code,
      matched_count: matches.length,
      added_count: addedCount,
    };
  },
};

// Export validation/evaluation utilities for testing
export { validateCriteria, evaluateNode, evaluateFieldCondition, buildCriteriaPreview };
export type { CriteriaNode, FieldCondition, GroupCondition };
