/**
 * GL Rule Engine — Accounting Rule Resolution & Journal Generation
 *
 * Core service for the Enterprise GL rule-based accounting system.
 * Manages the full pipeline: event definition -> criteria matching ->
 * rule set resolution -> journal line generation.
 *
 * Supports:
 *   - Event definitions with payload schema validation
 *   - Criteria definitions with multi-condition matching
 *   - Versioned accounting rule sets with approval workflow
 *   - Entry definitions with GL selector types (STATIC, FIELD, EXPRESSION)
 *   - Amount resolution (FIELD, EXPRESSION)
 *   - Narration template interpolation
 *   - Rule simulation and golden test-case validation
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, asc } from 'drizzle-orm';

/* ---------- Types ---------- */

interface ProposedJournalLine {
  line_order: number;
  dr_cr: 'DR' | 'CR';
  gl_head_code: string;
  amount: number;
  currency: string;
  narration: string;
  accounting_standard: string | null;
  dimension_mapping: Record<string, unknown> | null;
}

interface RuleResolutionResult {
  criteria: typeof schema.glCriteriaDefinitions.$inferSelect;
  ruleSet: typeof schema.glAccountingRuleSets.$inferSelect;
  entryDefinitions: Array<typeof schema.glAccountingEntryDefinitions.$inferSelect>;
}

interface TestCaseResult {
  testCaseId: number;
  testName: string;
  passed: boolean;
  expected: unknown;
  actual: ProposedJournalLine[] | null;
  error: string | null;
}

/* ---------- Helper: Expression Evaluator ---------- */

/**
 * Simple arithmetic expression evaluator.
 * Supports: +, -, *, /, field references (dot-notation like `event.amount`),
 * numeric literals, and parentheses.
 */
function evaluateExpression(expression: string, context: Record<string, any>): number {
  // Replace field references with their numeric values from context
  const resolved = expression.replace(/[a-zA-Z_][a-zA-Z0-9_.]*/g, (match) => {
    const value = resolveFieldValue(match, context);
    if (value === undefined || value === null) {
      throw new Error(`Expression field "${match}" not found in context`);
    }
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Expression field "${match}" resolved to non-numeric value: ${value}`);
    }
    return String(num);
  });

  // Validate: only allow digits, whitespace, parentheses, and arithmetic operators
  if (!/^[\d\s+\-*/().]+$/.test(resolved)) {
    throw new Error(`Invalid expression after resolution: ${resolved}`);
  }

  // Safe evaluation via Function constructor (only arithmetic)
  try {
    const result = new Function(`"use strict"; return (${resolved});`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Expression "${expression}" evaluated to non-finite number`);
    }
    return result;
  } catch (err: any) {
    throw new Error(`Failed to evaluate expression "${expression}": ${err.message}`);
  }
}

/* ---------- Helper: Condition Evaluator ---------- */

/**
 * Evaluate a single criteria condition against an event payload.
 * Supported relations: =, !=, in, not in, >, <, >=, <=
 */
function evaluateCondition(
  condition: { field_name: string; relation: string; field_value: string },
  payload: Record<string, any>,
): boolean {
  const actualValue = resolveFieldValue(condition.field_name, payload);
  const relation = condition.relation.trim().toLowerCase();

  switch (relation) {
    case '=':
    case 'eq': {
      return String(actualValue) === condition.field_value;
    }
    case '!=':
    case 'neq': {
      return String(actualValue) !== condition.field_value;
    }
    case 'in': {
      const allowedValues = parseListValue(condition.field_value);
      return allowedValues.includes(String(actualValue));
    }
    case 'not in':
    case 'not_in': {
      const excludedValues = parseListValue(condition.field_value);
      return !excludedValues.includes(String(actualValue));
    }
    case '>':
    case 'gt': {
      return Number(actualValue) > Number(condition.field_value);
    }
    case '<':
    case 'lt': {
      return Number(actualValue) < Number(condition.field_value);
    }
    case '>=':
    case 'gte': {
      return Number(actualValue) >= Number(condition.field_value);
    }
    case '<=':
    case 'lte': {
      return Number(actualValue) <= Number(condition.field_value);
    }
    default:
      throw new Error(`Unsupported condition relation: "${condition.relation}"`);
  }
}

/* ---------- Helper: GL Selector Resolution ---------- */

/**
 * Resolve a GL code from a selector based on its type.
 *   STATIC     — selector is the literal GL code
 *   FIELD      — selector is a dot-path into the event payload
 *   EXPRESSION — selector is an expression that evaluates to a GL code
 */
function resolveGlSelector(
  selector: string,
  selectorType: string,
  context: Record<string, any>,
): string {
  switch (selectorType) {
    case 'STATIC':
      return selector;

    case 'FIELD': {
      const value = resolveFieldValue(selector, context);
      if (value === undefined || value === null) {
        throw new Error(`GL selector field "${selector}" not found in event payload`);
      }
      return String(value);
    }

    case 'EXPRESSION': {
      // Expression may contain field references that resolve to GL codes
      // e.g., "event.product_gl_map.asset" or template strings
      const resolved = selector.replace(/\{([^}]+)\}/g, (_match, fieldPath) => {
        const val = resolveFieldValue(fieldPath.trim(), context);
        if (val === undefined || val === null) {
          throw new Error(`GL selector expression field "${fieldPath}" not found`);
        }
        return String(val);
      });
      return resolved;
    }

    default:
      throw new Error(`Unsupported GL selector type: "${selectorType}"`);
  }
}

/* ---------- Helper: Field Resolution ---------- */

/**
 * Resolve a dot-notation field path from a context object.
 * e.g., "event.amount" resolves context.event.amount
 */
function resolveFieldValue(fieldPath: string, context: Record<string, any>): any {
  const parts = fieldPath.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Parse a comma-separated list value, stripping surrounding brackets.
 * e.g., "[A,B,C]" -> ["A","B","C"]
 */
function parseListValue(fieldValue: string): string[] {
  const trimmed = fieldValue.trim().replace(/^\[/, '').replace(/\]$/, '');
  return trimmed.split(',').map((v) => v.trim());
}

/**
 * Interpolate a narration template with context values.
 * Template syntax: {{field.path}}
 * e.g., "Purchase of {{event.security_name}} qty {{event.quantity}}"
 */
function interpolateNarration(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, fieldPath) => {
    const val = resolveFieldValue(fieldPath.trim(), context);
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/* ---------- Main Service ---------- */

export const glRuleEngine = {
  // ==========================================================================
  // Event Definitions
  // ==========================================================================

  /** Create a new event definition */
  async createEventDefinition(data: {
    product: string;
    event_code: string;
    event_name: string;
    payload_schema?: Record<string, unknown>;
    posting_mode: (typeof schema.postingModeEnum.enumValues)[number];
    authorization_policy?: string;
    reversal_policy?: string;
    description?: string;
  }) {
    const [result] = await db
      .insert(schema.glEventDefinitions)
      .values({
        product: data.product,
        event_code: data.event_code,
        event_name: data.event_name,
        payload_schema: data.payload_schema ?? null,
        posting_mode: data.posting_mode,
        authorization_policy: data.authorization_policy ?? 'AUTO',
        reversal_policy: data.reversal_policy ?? null,
        description: data.description ?? null,
      })
      .returning();

    return result;
  },

  /** List event definitions with optional search and pagination */
  async getEventDefinitions(search?: string, page?: number, limit?: number) {
    const pageNum = page ?? 1;
    const pageSize = Math.min(limit ?? 25, 100);
    const offset = (pageNum - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (search) {
      conditions.push(
        sql`(
          ${schema.glEventDefinitions.event_code} ILIKE ${'%' + search + '%'}
          OR ${schema.glEventDefinitions.event_name} ILIKE ${'%' + search + '%'}
          OR ${schema.glEventDefinitions.product} ILIKE ${'%' + search + '%'}
        )` as any,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glEventDefinitions)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(asc(schema.glEventDefinitions.event_code));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glEventDefinitions)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: pageNum, pageSize };
  },

  /** Get a single event definition by ID */
  async getEventDefinition(id: number) {
    const [result] = await db
      .select()
      .from(schema.glEventDefinitions)
      .where(eq(schema.glEventDefinitions.id, id))
      .limit(1);

    if (!result) throw new Error(`Event definition not found: ${id}`);
    return result;
  },

  /** Lookup event definition by event_code */
  async getEventByCode(eventCode: string) {
    const [result] = await db
      .select()
      .from(schema.glEventDefinitions)
      .where(eq(schema.glEventDefinitions.event_code, eventCode))
      .limit(1);

    if (!result) throw new Error(`Event definition not found for code: ${eventCode}`);
    return result;
  },

  // ==========================================================================
  // Criteria Definitions
  // ==========================================================================

  /** Create a criteria definition with its conditions */
  async createCriteriaDefinition(data: {
    event_id: number;
    criteria_name: string;
    priority?: number;
    effective_from: string;
    effective_to?: string;
    is_default?: boolean;
    description?: string;
    conditions: Array<{
      field_name: string;
      relation: string;
      field_value: string;
    }>;
  }) {
    // Insert criteria header
    const [criteria] = await db
      .insert(schema.glCriteriaDefinitions)
      .values({
        event_id: data.event_id,
        criteria_name: data.criteria_name,
        priority: data.priority ?? 100,
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        is_default: data.is_default ?? false,
        description: data.description ?? null,
      })
      .returning();

    // Insert conditions
    if (data.conditions.length > 0) {
      await db.insert(schema.glCriteriaConditions).values(
        data.conditions.map((cond) => ({
          criteria_id: criteria.id,
          field_name: cond.field_name,
          relation: cond.relation,
          field_value: cond.field_value,
        })),
      );
    }

    // Return criteria with conditions
    const conditions = await db
      .select()
      .from(schema.glCriteriaConditions)
      .where(eq(schema.glCriteriaConditions.criteria_id, criteria.id));

    return { ...criteria, conditions };
  },

  /** List criteria definitions, optionally filtered by event */
  async getCriteriaDefinitions(eventId?: number) {
    const where = eventId
      ? eq(schema.glCriteriaDefinitions.event_id, eventId)
      : undefined;

    const data = await db
      .select()
      .from(schema.glCriteriaDefinitions)
      .where(where)
      .orderBy(asc(schema.glCriteriaDefinitions.priority));

    return data;
  },

  /** Get a single criteria definition with its conditions */
  async getCriteriaDefinition(id: number) {
    const [criteria] = await db
      .select()
      .from(schema.glCriteriaDefinitions)
      .where(eq(schema.glCriteriaDefinitions.id, id))
      .limit(1);

    if (!criteria) throw new Error(`Criteria definition not found: ${id}`);

    const conditions = await db
      .select()
      .from(schema.glCriteriaConditions)
      .where(eq(schema.glCriteriaConditions.criteria_id, id));

    return { ...criteria, conditions };
  },

  /**
   * Match an event against criteria definitions.
   *
   * Algorithm:
   *   1. Find the event definition by event_code
   *   2. Get all active criteria for that event, ordered by priority (ascending = higher priority)
   *   3. For each criteria, check effective dates and evaluate all conditions
   *   4. Return the highest-priority matching criteria
   *   5. If no explicit match, fall back to the default criteria (is_default=true)
   *   6. Throw if no criteria matches at all
   */
  async matchCriteria(eventCode: string, eventPayload: Record<string, any>) {
    // Look up the event definition
    const eventDef = await glRuleEngine.getEventByCode(eventCode);

    // Get all active criteria for this event, ordered by priority (lowest number = highest priority)
    const allCriteria = await db
      .select()
      .from(schema.glCriteriaDefinitions)
      .where(
        and(
          eq(schema.glCriteriaDefinitions.event_id, eventDef.id),
          eq(schema.glCriteriaDefinitions.is_active, true),
        ),
      )
      .orderBy(asc(schema.glCriteriaDefinitions.priority));

    const today = new Date().toISOString().split('T')[0];
    let defaultCriteria: typeof allCriteria[number] | null = null;

    for (const criteria of allCriteria) {
      // Check effective date window
      if (criteria.effective_from > today) continue;
      if (criteria.effective_to && criteria.effective_to < today) continue;

      // Track default as fallback
      if (criteria.is_default) {
        defaultCriteria = criteria;
      }

      // Skip defaults during explicit matching — they are fallbacks only
      if (criteria.is_default) continue;

      // Get conditions for this criteria
      const conditions = await db
        .select()
        .from(schema.glCriteriaConditions)
        .where(eq(schema.glCriteriaConditions.criteria_id, criteria.id));

      // If no conditions defined, this criteria matches any event
      if (conditions.length === 0) {
        return criteria;
      }

      // All conditions must match (AND logic)
      const allMatch = conditions.every((cond: any) => {
        try {
          return evaluateCondition(cond, eventPayload);
        } catch {
          return false;
        }
      });

      if (allMatch) {
        return criteria;
      }
    }

    // Fall back to default criteria
    if (defaultCriteria) {
      return defaultCriteria;
    }

    throw new Error(
      `No matching criteria found for event "${eventCode}" with payload: ${JSON.stringify(eventPayload)}`,
    );
  },

  // ==========================================================================
  // Accounting Rule Sets
  // ==========================================================================

  /** Create an accounting rule set in DRAFT status with its entry definitions */
  async createAccountingRuleSet(data: {
    criteria_id: number;
    rule_code: string;
    rule_name: string;
    rule_version?: number;
    effective_from: string;
    effective_to?: string;
    description?: string;
    entryDefinitions: Array<{
      line_order: number;
      dr_cr: 'DR' | 'CR';
      gl_selector: string;
      gl_selector_type?: string;
      amount_type?: string;
      amount_field?: string;
      amount_expression?: string;
      currency_expression?: string;
      narration_template?: string;
      posting_trigger?: string;
      accounting_standard?: (typeof schema.accountingStandardEnum.enumValues)[number];
      dimension_mapping?: Record<string, unknown>;
      description?: string;
    }>;
  }) {
    // Insert rule set header
    const [ruleSet] = await db
      .insert(schema.glAccountingRuleSets)
      .values({
        criteria_id: data.criteria_id,
        rule_code: data.rule_code,
        rule_name: data.rule_name,
        rule_version: data.rule_version ?? 1,
        rule_status: 'DRAFT',
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        description: data.description ?? null,
      })
      .returning();

    // Insert entry definitions
    if (data.entryDefinitions.length > 0) {
      await db.insert(schema.glAccountingEntryDefinitions).values(
        data.entryDefinitions.map((entry) => ({
          rule_set_id: ruleSet.id,
          line_order: entry.line_order,
          dr_cr: entry.dr_cr,
          gl_selector: entry.gl_selector,
          gl_selector_type: entry.gl_selector_type ?? 'STATIC',
          amount_type: entry.amount_type ?? 'FIELD',
          amount_field: entry.amount_field ?? null,
          amount_expression: entry.amount_expression ?? null,
          currency_expression: entry.currency_expression ?? 'event.currency',
          narration_template: entry.narration_template ?? null,
          posting_trigger: entry.posting_trigger ?? null,
          accounting_standard: entry.accounting_standard ?? null,
          dimension_mapping: entry.dimension_mapping ?? null,
          description: entry.description ?? null,
        })),
      );
    }

    // Return rule set with entry definitions
    const entryDefs = await db
      .select()
      .from(schema.glAccountingEntryDefinitions)
      .where(eq(schema.glAccountingEntryDefinitions.rule_set_id, ruleSet.id))
      .orderBy(asc(schema.glAccountingEntryDefinitions.line_order));

    return { ...ruleSet, entryDefinitions: entryDefs };
  },

  /** List accounting rule sets with optional filters */
  async getAccountingRuleSets(criteriaId?: number, status?: string) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (criteriaId) {
      conditions.push(eq(schema.glAccountingRuleSets.criteria_id, criteriaId));
    }

    if (status) {
      conditions.push(eq(schema.glAccountingRuleSets.rule_status, status as any));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(where)
      .orderBy(desc(schema.glAccountingRuleSets.created_at));

    return data;
  },

  /** Get a single accounting rule set with its entry definitions */
  async getAccountingRuleSet(id: number) {
    const [ruleSet] = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(eq(schema.glAccountingRuleSets.id, id))
      .limit(1);

    if (!ruleSet) throw new Error(`Accounting rule set not found: ${id}`);

    const entryDefinitions = await db
      .select()
      .from(schema.glAccountingEntryDefinitions)
      .where(eq(schema.glAccountingEntryDefinitions.rule_set_id, id))
      .orderBy(asc(schema.glAccountingEntryDefinitions.line_order));

    return { ...ruleSet, entryDefinitions };
  },

  /** Approve a rule set: transition DRAFT -> ACTIVE */
  async approveRuleSet(id: number, approverId: number) {
    const [ruleSet] = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(eq(schema.glAccountingRuleSets.id, id))
      .limit(1);

    if (!ruleSet) throw new Error(`Accounting rule set not found: ${id}`);

    if (ruleSet.rule_status !== 'DRAFT' && ruleSet.rule_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve rule set: current status is "${ruleSet.rule_status}", expected DRAFT or PENDING_APPROVAL`,
      );
    }

    // Validate that entry definitions exist
    const entryCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glAccountingEntryDefinitions)
      .where(eq(schema.glAccountingEntryDefinitions.rule_set_id, id));

    if (Number(entryCount[0]?.count ?? 0) === 0) {
      throw new Error('Cannot approve rule set with no entry definitions');
    }

    const [updated] = await db
      .update(schema.glAccountingRuleSets)
      .set({
        rule_status: 'ACTIVE',
        approved_by: approverId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.glAccountingRuleSets.id, id))
      .returning();

    return updated;
  },

  /** Retire a rule set: transition ACTIVE -> RETIRED */
  async retireRuleSet(id: number) {
    const [ruleSet] = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(eq(schema.glAccountingRuleSets.id, id))
      .limit(1);

    if (!ruleSet) throw new Error(`Accounting rule set not found: ${id}`);

    if (ruleSet.rule_status !== 'ACTIVE') {
      throw new Error(
        `Cannot retire rule set: current status is "${ruleSet.rule_status}", expected ACTIVE`,
      );
    }

    const [updated] = await db
      .update(schema.glAccountingRuleSets)
      .set({
        rule_status: 'RETIRED',
        effective_to: new Date().toISOString().split('T')[0],
        updated_at: new Date(),
      })
      .where(eq(schema.glAccountingRuleSets.id, id))
      .returning();

    return updated;
  },

  /** Find the active rule set for a criteria as of an effective date */
  async getActiveRuleForCriteria(criteriaId: number, effectiveDate: string) {
    const results = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(
        and(
          eq(schema.glAccountingRuleSets.criteria_id, criteriaId),
          eq(schema.glAccountingRuleSets.rule_status, 'ACTIVE'),
          sql`${schema.glAccountingRuleSets.effective_from} <= ${effectiveDate}`,
          sql`(${schema.glAccountingRuleSets.effective_to} IS NULL OR ${schema.glAccountingRuleSets.effective_to} >= ${effectiveDate})`,
        ),
      )
      .orderBy(desc(schema.glAccountingRuleSets.rule_version))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return results[0];
  },

  // ==========================================================================
  // Entry Definitions
  // ==========================================================================

  /** Get all entry definitions for a rule set */
  async getEntryDefinitions(ruleSetId: number) {
    const data = await db
      .select()
      .from(schema.glAccountingEntryDefinitions)
      .where(eq(schema.glAccountingEntryDefinitions.rule_set_id, ruleSetId))
      .orderBy(asc(schema.glAccountingEntryDefinitions.line_order));

    return data;
  },

  // ==========================================================================
  // Rule Resolution — Full Pipeline
  // ==========================================================================

  /**
   * Resolve the complete accounting rule for an event.
   *
   * Pipeline:
   *   1. Match criteria for the event code + payload
   *   2. Find the active rule set for the matched criteria as of effective date
   *   3. Get entry definitions for the rule set
   *   4. Return { criteria, ruleSet, entryDefinitions }
   */
  async resolveAccountingRule(
    eventCode: string,
    eventPayload: Record<string, any>,
    effectiveDate?: string,
  ): Promise<RuleResolutionResult> {
    const effDate = effectiveDate ?? new Date().toISOString().split('T')[0];

    // Step 1: Match criteria
    const criteria = await glRuleEngine.matchCriteria(eventCode, eventPayload);

    // Step 2: Find active rule set
    const ruleSet = await glRuleEngine.getActiveRuleForCriteria(criteria.id, effDate);

    if (!ruleSet) {
      throw new Error(
        `No active rule set found for criteria "${criteria.criteria_name}" (id=${criteria.id}) as of ${effDate}`,
      );
    }

    // Step 3: Get entry definitions
    const entryDefinitions = await glRuleEngine.getEntryDefinitions(ruleSet.id);

    if (entryDefinitions.length === 0) {
      throw new Error(
        `Rule set "${ruleSet.rule_code}" v${ruleSet.rule_version} has no entry definitions`,
      );
    }

    return { criteria, ruleSet, entryDefinitions };
  },

  // ==========================================================================
  // Journal Generation
  // ==========================================================================

  /**
   * Generate proposed journal lines from a rule set + entry definitions + event payload.
   *
   * For each entry definition:
   *   1. Resolve GL code via gl_selector / gl_selector_type
   *   2. Resolve amount via amount_type (FIELD -> event field, EXPRESSION -> evaluate)
   *   3. Resolve currency from currency_expression
   *   4. Interpolate narration template
   *   5. Produce a journal line with dr_cr, gl_head_code, amount, currency, narration
   */
  generateJournalLines(
    ruleSet: typeof schema.glAccountingRuleSets.$inferSelect,
    entryDefinitions: Array<typeof schema.glAccountingEntryDefinitions.$inferSelect>,
    eventPayload: Record<string, any>,
  ): ProposedJournalLine[] {
    const context: Record<string, any> = {
      event: eventPayload,
      rule: {
        rule_code: ruleSet.rule_code,
        rule_version: ruleSet.rule_version,
      },
    };

    const lines: ProposedJournalLine[] = [];

    for (const entry of entryDefinitions) {
      // 1. Resolve GL code
      const glHeadCode = resolveGlSelector(entry.gl_selector, entry.gl_selector_type, context);

      // 2. Resolve amount
      let amount: number;

      if (entry.amount_type === 'FIELD') {
        const fieldPath = entry.amount_field ?? 'event.amount';
        const rawValue = resolveFieldValue(fieldPath, context);
        if (rawValue === undefined || rawValue === null) {
          throw new Error(
            `Amount field "${fieldPath}" not found in event payload for entry line ${entry.line_order}`,
          );
        }
        amount = Number(rawValue);
        if (isNaN(amount)) {
          throw new Error(
            `Amount field "${fieldPath}" resolved to non-numeric value: ${rawValue}`,
          );
        }
      } else if (entry.amount_type === 'EXPRESSION') {
        const expr = entry.amount_expression;
        if (!expr) {
          throw new Error(
            `Amount expression is empty for entry line ${entry.line_order}`,
          );
        }
        amount = evaluateExpression(expr, context);
      } else {
        throw new Error(`Unsupported amount_type "${entry.amount_type}" for entry line ${entry.line_order}`);
      }

      // Round to 4 decimal places
      amount = Math.round(amount * 10000) / 10000;

      // 3. Resolve currency
      const currencyExpr = entry.currency_expression ?? 'event.currency';
      let currency: string;
      const currencyValue = resolveFieldValue(currencyExpr, context);
      if (currencyValue !== undefined && currencyValue !== null) {
        currency = String(currencyValue);
      } else {
        // Fallback: try as literal
        currency = currencyExpr;
      }

      // 4. Interpolate narration
      const narration = entry.narration_template
        ? interpolateNarration(entry.narration_template, context)
        : `${entry.dr_cr} ${glHeadCode} ${amount} ${currency}`;

      // 5. Build proposed line
      lines.push({
        line_order: entry.line_order,
        dr_cr: entry.dr_cr,
        gl_head_code: glHeadCode,
        amount,
        currency,
        narration,
        accounting_standard: entry.accounting_standard ?? null,
        dimension_mapping: (entry.dimension_mapping as Record<string, unknown>) ?? null,
      });
    }

    // Validate DR/CR balance
    const totalDR = lines
      .filter((l) => l.dr_cr === 'DR')
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCR = lines
      .filter((l) => l.dr_cr === 'CR')
      .reduce((sum, l) => sum + l.amount, 0);

    const roundedDR = Math.round(totalDR * 10000) / 10000;
    const roundedCR = Math.round(totalCR * 10000) / 10000;

    if (roundedDR !== roundedCR) {
      throw new Error(
        `Journal lines are unbalanced: total DR=${roundedDR}, total CR=${roundedCR} (difference=${Math.round((roundedDR - roundedCR) * 10000) / 10000})`,
      );
    }

    return lines;
  },

  // ==========================================================================
  // Rule Simulation
  // ==========================================================================

  /**
   * Simulate a rule against a sample event payload without actually posting.
   * Useful for rule development and testing.
   */
  async simulateRule(ruleSetId: number, samplePayload: Record<string, any>) {
    const ruleSetWithEntries = await glRuleEngine.getAccountingRuleSet(ruleSetId);

    const validationErrors: string[] = [];

    // Try generating journal lines
    let proposedLines: ProposedJournalLine[] | null = null;

    try {
      proposedLines = glRuleEngine.generateJournalLines(
        ruleSetWithEntries,
        ruleSetWithEntries.entryDefinitions,
        samplePayload,
      );
    } catch (err: any) {
      validationErrors.push(err.message);
    }

    // Additional validation checks
    if (proposedLines) {
      if (proposedLines.length === 0) {
        validationErrors.push('No journal lines were generated');
      }

      const hasDR = proposedLines.some((l) => l.dr_cr === 'DR');
      const hasCR = proposedLines.some((l) => l.dr_cr === 'CR');

      if (!hasDR) validationErrors.push('No debit lines generated');
      if (!hasCR) validationErrors.push('No credit lines generated');
    }

    return {
      ruleSetId,
      ruleCode: ruleSetWithEntries.rule_code,
      ruleVersion: ruleSetWithEntries.rule_version,
      samplePayload,
      proposedLines,
      validation: {
        passed: validationErrors.length === 0,
        errors: validationErrors,
      },
    };
  },

  // ==========================================================================
  // Test Cases
  // ==========================================================================

  /** Create a golden test case for a rule set */
  async createRuleTestCase(data: {
    rule_set_id: number;
    test_name: string;
    sample_event_payload: Record<string, any>;
    expected_journal_lines: Array<Record<string, any>>;
    is_rejection_case?: boolean;
    expected_error?: string;
  }) {
    // Verify rule set exists
    const [ruleSet] = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(eq(schema.glAccountingRuleSets.id, data.rule_set_id))
      .limit(1);

    if (!ruleSet) throw new Error(`Rule set not found: ${data.rule_set_id}`);

    const [result] = await db
      .insert(schema.glRuleTestCases)
      .values({
        rule_set_id: data.rule_set_id,
        test_name: data.test_name,
        sample_event_payload: data.sample_event_payload,
        expected_journal_lines: data.expected_journal_lines,
        is_rejection_case: data.is_rejection_case ?? false,
        expected_error: data.expected_error ?? null,
      })
      .returning();

    return result;
  },

  /** List test cases for a rule set */
  async getRuleTestCases(ruleSetId: number) {
    const data = await db
      .select()
      .from(schema.glRuleTestCases)
      .where(eq(schema.glRuleTestCases.rule_set_id, ruleSetId))
      .orderBy(asc(schema.glRuleTestCases.id));

    return data;
  },

  /**
   * Validate a rule set against all its golden test cases.
   *
   * For each test case:
   *   - Run generateJournalLines with the sample payload
   *   - If is_rejection_case: expect an error matching expected_error
   *   - Otherwise: compare generated lines against expected_journal_lines
   */
  async validateRuleAgainstTestCases(ruleSetId: number) {
    const ruleSetWithEntries = await glRuleEngine.getAccountingRuleSet(ruleSetId);
    const testCases = await glRuleEngine.getRuleTestCases(ruleSetId);

    if (testCases.length === 0) {
      return {
        ruleSetId,
        ruleCode: ruleSetWithEntries.rule_code,
        totalTests: 0,
        passed: 0,
        failed: 0,
        results: [] as TestCaseResult[],
      };
    }

    const results: TestCaseResult[] = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const testCase of testCases) {
      const payload = testCase.sample_event_payload as Record<string, any>;
      const expectedLines = testCase.expected_journal_lines as Array<Record<string, any>>;
      let actualLines: ProposedJournalLine[] | null = null;
      let error: string | null = null;
      let passed = false;

      try {
        actualLines = glRuleEngine.generateJournalLines(
          ruleSetWithEntries,
          ruleSetWithEntries.entryDefinitions,
          payload,
        );

        if (testCase.is_rejection_case) {
          // Expected an error but got success
          error = 'Expected rejection but journal lines were generated successfully';
          passed = false;
        } else {
          // Compare actual vs expected
          passed = compareJournalLines(actualLines, expectedLines);
          if (!passed) {
            error = 'Generated journal lines do not match expected output';
          }
        }
      } catch (err: any) {
        if (testCase.is_rejection_case) {
          // Rejection case: check if error matches expected
          if (testCase.expected_error) {
            passed = err.message.includes(testCase.expected_error);
            if (!passed) {
              error = `Expected error containing "${testCase.expected_error}", got: "${err.message}"`;
            }
          } else {
            // Any error satisfies a generic rejection case
            passed = true;
          }
        } else {
          error = err.message;
          passed = false;
        }
      }

      if (passed) {
        passedCount++;
      } else {
        failedCount++;
      }

      results.push({
        testCaseId: testCase.id,
        testName: testCase.test_name,
        passed,
        expected: testCase.is_rejection_case ? testCase.expected_error : expectedLines,
        actual: actualLines,
        error,
      });
    }

    return {
      ruleSetId,
      ruleCode: ruleSetWithEntries.rule_code,
      totalTests: testCases.length,
      passed: passedCount,
      failed: failedCount,
      results,
    };
  },
};

/* ---------- Helper: Compare Journal Lines ---------- */

/**
 * Compare generated journal lines against expected output.
 * Matches on: line_order, dr_cr, gl_head_code, amount, currency.
 */
function compareJournalLines(
  actual: ProposedJournalLine[],
  expected: Array<Record<string, any>>,
): boolean {
  if (actual.length !== expected.length) return false;

  // Sort both by line_order for deterministic comparison
  const sortedActual = [...actual].sort((a, b) => a.line_order - b.line_order);
  const sortedExpected = [...expected].sort(
    (a, b) => (a.line_order ?? 0) - (b.line_order ?? 0),
  );

  for (let i = 0; i < sortedActual.length; i++) {
    const act = sortedActual[i];
    const exp = sortedExpected[i];

    if (exp.dr_cr !== undefined && act.dr_cr !== exp.dr_cr) return false;
    if (exp.gl_head_code !== undefined && act.gl_head_code !== exp.gl_head_code) return false;
    if (exp.amount !== undefined && act.amount !== Number(exp.amount)) return false;
    if (exp.currency !== undefined && act.currency !== exp.currency) return false;
    if (exp.line_order !== undefined && act.line_order !== Number(exp.line_order)) return false;
  }

  return true;
}
