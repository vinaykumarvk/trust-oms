/**
 * GL Posting Engine — Enterprise General Ledger Core Posting Service
 *
 * Implements the full posting lifecycle for the Enterprise GL system:
 *   Business Event → Accounting Intent → Journal Batch → Validation →
 *   Authorization (maker/checker) → Posting → Ledger Balance Update
 *
 * Supports: online/batch/manual posting modes, idempotent event ingestion,
 * criteria-based rule resolution, atomic posting with balance upsert,
 * maker/checker authorization, journal cancellation via compensating entries,
 * drilldown queries, and balance rebuild for audit/reconciliation.
 *
 * Philippine Trust Banking GL — BSP/FRPTI-compliant.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { glAuthorizationService } from './gl-authorization-service';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a batch reference: GLB-YYYYMMDD-NNNN */
function generateBatchRef(): string {
  const now = new Date();
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const seq = String(crypto.randomInt(1, 10000)).padStart(4, '0');
  return `GLB-${ymd}-${seq}`;
}

/** Create a SHA-256-style hash from a payload (simple deterministic string) */
function hashPayload(payload: Record<string, unknown>): string {
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Evaluate a simple field reference against an event payload (e.g. "event.amount") */
function resolveFieldValue(expression: string, payload: Record<string, unknown>): unknown {
  const parts = expression.replace(/^event\./, '').split('.');
  let current: unknown = payload;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Parse numeric string safely */
function toNum(val: string | number | null | undefined): number {
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/** Format a number to 2-decimal string */
function fmt(n: number): string {
  return n.toFixed(2);
}

/** Today as YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

interface ValidationError {
  line_no?: number;
  field: string;
  message: string;
  severity: 'HARD' | 'SOFT';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  batch_id: number;
}

// ---------------------------------------------------------------------------
// GL Posting Engine
// ---------------------------------------------------------------------------

export const glPostingEngine = {
  // =========================================================================
  // 1. submitBusinessEvent
  // =========================================================================
  /**
   * Accept a business event, validate idempotency key, and store in
   * gl_business_events. Returns the event_id.
   */
  async submitBusinessEvent(params: {
    sourceSystem: string;
    sourceReference: string;
    idempotencyKey: string;
    eventCode: string;
    eventPayload: Record<string, unknown>;
    businessDate: string;
  }): Promise<{ event_id: number; duplicate: boolean }> {
    // Check idempotency — if already submitted, return the existing event
    const [existing] = await db
      .select()
      .from(schema.glBusinessEvents)
      .where(eq(schema.glBusinessEvents.idempotency_key, params.idempotencyKey))
      .limit(1);

    if (existing) {
      return { event_id: existing.id, duplicate: true };
    }

    const eventHash = hashPayload(params.eventPayload);

    const [event] = await db
      .insert(schema.glBusinessEvents)
      .values({
        source_system: params.sourceSystem,
        source_reference: params.sourceReference,
        idempotency_key: params.idempotencyKey,
        event_code: params.eventCode,
        event_payload: params.eventPayload as Record<string, unknown>,
        event_hash: eventHash,
        business_date: params.businessDate,
        processed: false,
      })
      .returning();

    return { event_id: event.id, duplicate: false };
  },

  // =========================================================================
  // 2. resolveAccountingIntent
  // =========================================================================
  /**
   * Match the event to criteria / rule, create an accounting intent record.
   * Uses gl_event_definitions, gl_criteria_definitions,
   * gl_criteria_conditions, and gl_accounting_rule_sets.
   */
  async resolveAccountingIntent(eventId: number): Promise<{
    intent_id: number;
    criteria_id: number | null;
    rule_set_id: number | null;
    rule_version: number | null;
  }> {
    // 1. Fetch the business event
    const [event] = await db
      .select()
      .from(schema.glBusinessEvents)
      .where(eq(schema.glBusinessEvents.id, eventId))
      .limit(1);

    if (!event) {
      throw new Error(`Business event not found: ${eventId}`);
    }

    // 2. Fetch the event definition
    const [eventDef] = await db
      .select()
      .from(schema.glEventDefinitions)
      .where(
        and(
          eq(schema.glEventDefinitions.event_code, event.event_code),
          eq(schema.glEventDefinitions.is_active, true),
        ),
      )
      .limit(1);

    if (!eventDef) {
      // Create intent with FAILED status
      const [intent] = await db
        .insert(schema.glAccountingIntents)
        .values({
          event_id: eventId,
          event_code: event.event_code,
          intent_status: 'FAILED',
          error_message: `No active event definition found for event_code: ${event.event_code}`,
        })
        .returning();

      return {
        intent_id: intent.id,
        criteria_id: null,
        rule_set_id: null,
        rule_version: null,
      };
    }

    // 3. Fetch criteria definitions for this event, ordered by priority (lower = higher priority)
    const criteriaList = await db
      .select()
      .from(schema.glCriteriaDefinitions)
      .where(
        and(
          eq(schema.glCriteriaDefinitions.event_id, eventDef.id),
          eq(schema.glCriteriaDefinitions.is_active, true),
        ),
      )
      .orderBy(schema.glCriteriaDefinitions.priority);

    const payload = event.event_payload as Record<string, unknown>;
    let matchedCriteria: typeof criteriaList[number] | null = null;

    // 4. Evaluate each criteria against the event payload
    for (const criteria of criteriaList) {
      // Skip default criteria on the first pass — we try specific first
      if (criteria.is_default) continue;

      // Check effective date range
      const today = todayStr();
      if (criteria.effective_from > today) continue;
      if (criteria.effective_to && criteria.effective_to < today) continue;

      // Fetch conditions for this criteria
      const conditions = await db
        .select()
        .from(schema.glCriteriaConditions)
        .where(eq(schema.glCriteriaConditions.criteria_id, criteria.id));

      // All conditions must match
      let allMatch = true;
      for (const cond of conditions) {
        const fieldValue = String(resolveFieldValue(cond.field_name, payload) ?? '');
        const condValue = cond.field_value;
        const relation = cond.relation;

        let matches = false;
        switch (relation) {
          case '=':
          case '==':
            matches = fieldValue === condValue;
            break;
          case '!=':
            matches = fieldValue !== condValue;
            break;
          case 'in':
            matches = condValue.split(',').map((v: string) => v.trim()).includes(fieldValue);
            break;
          case 'not in':
            matches = !condValue.split(',').map((v: string) => v.trim()).includes(fieldValue);
            break;
          case '>':
            matches = parseFloat(fieldValue) > parseFloat(condValue);
            break;
          case '<':
            matches = parseFloat(fieldValue) < parseFloat(condValue);
            break;
          case '>=':
            matches = parseFloat(fieldValue) >= parseFloat(condValue);
            break;
          case '<=':
            matches = parseFloat(fieldValue) <= parseFloat(condValue);
            break;
          default:
            matches = false;
        }

        if (!matches) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        matchedCriteria = criteria;
        break;
      }
    }

    // Fall back to default criteria if no specific match
    if (!matchedCriteria) {
      matchedCriteria =
        criteriaList.find((c: any) => c.is_default) ?? null;
    }

    if (!matchedCriteria) {
      const [intent] = await db
        .insert(schema.glAccountingIntents)
        .values({
          event_id: eventId,
          event_code: event.event_code,
          intent_status: 'FAILED',
          error_message: `No matching criteria found for event ${eventId} (event_code: ${event.event_code})`,
        })
        .returning();

      return {
        intent_id: intent.id,
        criteria_id: null,
        rule_set_id: null,
        rule_version: null,
      };
    }

    // 5. Find the active accounting rule set for the matched criteria
    const [ruleSet] = await db
      .select()
      .from(schema.glAccountingRuleSets)
      .where(
        and(
          eq(schema.glAccountingRuleSets.criteria_id, matchedCriteria.id),
          eq(schema.glAccountingRuleSets.rule_status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(schema.glAccountingRuleSets.rule_version))
      .limit(1);

    if (!ruleSet) {
      const [intent] = await db
        .insert(schema.glAccountingIntents)
        .values({
          event_id: eventId,
          event_code: event.event_code,
          criteria_id: matchedCriteria.id,
          intent_status: 'FAILED',
          error_message: `No active rule set for criteria ${matchedCriteria.id} (${matchedCriteria.criteria_name})`,
        })
        .returning();

      return {
        intent_id: intent.id,
        criteria_id: matchedCriteria.id,
        rule_set_id: null,
        rule_version: null,
      };
    }

    // 6. Create the resolved intent
    const [intent] = await db
      .insert(schema.glAccountingIntents)
      .values({
        event_id: eventId,
        event_code: event.event_code,
        criteria_id: matchedCriteria.id,
        rule_set_id: ruleSet.id,
        rule_version: ruleSet.rule_version,
        intent_status: 'RESOLVED',
      })
      .returning();

    // Mark the event as processed
    await db
      .update(schema.glBusinessEvents)
      .set({ processed: true, updated_at: new Date() })
      .where(eq(schema.glBusinessEvents.id, eventId));

    return {
      intent_id: intent.id,
      criteria_id: matchedCriteria.id,
      rule_set_id: ruleSet.id,
      rule_version: ruleSet.rule_version,
    };
  },

  // =========================================================================
  // 3. generateJournalBatch
  // =========================================================================
  /**
   * Generate a proposed journal batch with debit/credit lines derived from
   * gl_accounting_entry_definitions. Creates the batch in DRAFT status.
   */
  async generateJournalBatch(intentId: number): Promise<{
    batch_id: number;
    batch_ref: string;
    line_count: number;
  }> {
    // 1. Fetch the intent
    const [intent] = await db
      .select()
      .from(schema.glAccountingIntents)
      .where(eq(schema.glAccountingIntents.id, intentId))
      .limit(1);

    if (!intent) {
      throw new Error(`Accounting intent not found: ${intentId}`);
    }
    if (intent.intent_status !== 'RESOLVED') {
      throw new Error(
        `Intent ${intentId} is not in RESOLVED status (current: ${intent.intent_status})`,
      );
    }
    if (!intent.rule_set_id) {
      throw new Error(`Intent ${intentId} has no rule_set_id`);
    }

    // 2. Fetch the business event for payload
    const [event] = await db
      .select()
      .from(schema.glBusinessEvents)
      .where(eq(schema.glBusinessEvents.id, intent.event_id))
      .limit(1);

    if (!event) {
      throw new Error(`Business event not found for intent ${intentId}`);
    }

    const payload = event.event_payload as Record<string, unknown>;

    // 3. Fetch the event definition for posting_mode
    const [eventDef] = await db
      .select()
      .from(schema.glEventDefinitions)
      .where(eq(schema.glEventDefinitions.event_code, intent.event_code))
      .limit(1);

    // 4. Fetch entry definitions for the rule set, ordered by line_order
    const entryDefs = await db
      .select()
      .from(schema.glAccountingEntryDefinitions)
      .where(eq(schema.glAccountingEntryDefinitions.rule_set_id, intent.rule_set_id))
      .orderBy(schema.glAccountingEntryDefinitions.line_order);

    if (entryDefs.length === 0) {
      throw new Error(
        `No entry definitions found for rule_set_id ${intent.rule_set_id}`,
      );
    }

    // 5. Resolve accounting unit from payload
    const accountingUnitId = Number(
      resolveFieldValue('accounting_unit_id', payload) ?? 1,
    );

    // 6. Generate batch ref and create batch header
    const batchRef = generateBatchRef();
    const transactionDate = event.business_date;
    const valueDate =
      (resolveFieldValue('value_date', payload) as string) ?? transactionDate;
    const narration =
      (resolveFieldValue('narration', payload) as string) ??
      `Auto-generated from event ${event.event_code} #${event.id}`;
    const fundId = resolveFieldValue('fund_id', payload) as number | undefined;

    let totalDebit = 0;
    let totalCredit = 0;

    // Build journal lines from entry definitions
    const journalLines: Array<{
      line_no: number;
      dr_cr: 'DR' | 'CR';
      gl_head_id: number;
      gl_access_code: string | null;
      amount: string;
      currency: string;
      base_amount: string;
      narration: string | null;
      fund_id: number | null;
      portfolio_id: number | null;
      security_id: number | null;
      counterparty_id: number | null;
    }> = [];

    for (let i = 0; i < entryDefs.length; i++) {
      const def = entryDefs[i];

      // Resolve GL head
      let glHeadId: number;
      if (def.gl_selector_type === 'STATIC') {
        // Static GL code — look up by code
        const [glHead] = await db
          .select()
          .from(schema.glHeads)
          .where(eq(schema.glHeads.code, def.gl_selector))
          .limit(1);
        if (!glHead) {
          throw new Error(
            `GL head not found for static code: ${def.gl_selector} (entry def ${def.id})`,
          );
        }
        glHeadId = glHead.id;
      } else if (def.gl_selector_type === 'FIELD') {
        // Field reference — resolve from payload
        const glCode = String(resolveFieldValue(def.gl_selector, payload) ?? '');
        if (!glCode) {
          throw new Error(
            `GL code field ${def.gl_selector} is empty in event payload (entry def ${def.id})`,
          );
        }
        const [glHead] = await db
          .select()
          .from(schema.glHeads)
          .where(eq(schema.glHeads.code, glCode))
          .limit(1);
        if (!glHead) {
          throw new Error(`GL head not found for code: ${glCode} (entry def ${def.id})`);
        }
        glHeadId = glHead.id;
      } else {
        // EXPRESSION — evaluate as field reference for now
        const glCode = String(resolveFieldValue(def.gl_selector, payload) ?? def.gl_selector);
        const [glHead] = await db
          .select()
          .from(schema.glHeads)
          .where(eq(schema.glHeads.code, glCode))
          .limit(1);
        if (!glHead) {
          throw new Error(
            `GL head not found for expression: ${def.gl_selector} (entry def ${def.id})`,
          );
        }
        glHeadId = glHead.id;
      }

      // Resolve amount
      let amount: number;
      if (def.amount_type === 'FIELD' && def.amount_field) {
        amount = toNum(resolveFieldValue(def.amount_field, payload) as string | number);
      } else if (def.amount_expression) {
        // Simple expression: treat as field reference
        amount = toNum(resolveFieldValue(def.amount_expression, payload) as string | number);
      } else {
        amount = 0;
      }

      // Resolve currency
      const currency = String(
        resolveFieldValue(def.currency_expression, payload) ?? 'PHP',
      );

      // Build narration from template
      let lineNarration: string | null = null;
      if (def.narration_template) {
        lineNarration = def.narration_template.replace(
          /\{(\w+(?:\.\w+)*)\}/g,
          (_match: string, field: string) => String(resolveFieldValue(field, payload) ?? ''),
        );
      }

      if (def.dr_cr === 'DR') {
        totalDebit += amount;
      } else {
        totalCredit += amount;
      }

      journalLines.push({
        line_no: i + 1,
        dr_cr: def.dr_cr,
        gl_head_id: glHeadId,
        gl_access_code: (resolveFieldValue('gl_access_code', payload) as string) ?? null,
        amount: fmt(amount),
        currency,
        base_amount: fmt(amount), // Assumes base currency for now; FX conversion would be applied
        narration: lineNarration,
        fund_id: fundId ? Number(fundId) : null,
        portfolio_id: (resolveFieldValue('portfolio_id', payload) as number) ?? null,
        security_id: (resolveFieldValue('security_id', payload) as number) ?? null,
        counterparty_id: (resolveFieldValue('counterparty_id', payload) as number) ?? null,
      });
    }

    // 7. Insert batch and lines in a transaction
    const result = await db.transaction(async (tx: any) => {
      const [batch] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: batchRef,
          source_system: event.source_system,
          source_event_id: event.id,
          event_code: event.event_code,
          rule_version: String(intent.rule_version ?? 1),
          posting_mode: eventDef?.posting_mode ?? 'ONLINE',
          accounting_unit_id: accountingUnitId,
          transaction_date: transactionDate,
          value_date: valueDate,
          batch_status: 'DRAFT',
          total_debit: fmt(totalDebit),
          total_credit: fmt(totalCredit),
          line_count: journalLines.length,
          narration,
          fund_id: fundId ? Number(fundId) : null,
        })
        .returning();

      // Insert journal lines
      for (const line of journalLines) {
        await tx.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: line.line_no,
          dr_cr: line.dr_cr,
          gl_head_id: line.gl_head_id,
          gl_access_code: line.gl_access_code,
          amount: line.amount,
          currency: line.currency,
          base_currency: 'PHP',
          base_amount: line.base_amount,
          fund_id: line.fund_id,
          portfolio_id: line.portfolio_id,
          security_id: line.security_id,
          counterparty_id: line.counterparty_id,
          narration: line.narration,
        });
      }

      return batch;
    });

    return {
      batch_id: result.id,
      batch_ref: result.batch_ref,
      line_count: journalLines.length,
    };
  },

  // =========================================================================
  // 4. validateJournalBatch
  // =========================================================================
  /**
   * Validate a journal batch:
   *  - At least 2 lines
   *  - Total debit equals total credit
   *  - GL heads exist and are OPEN
   *  - GL type matches category
   *  - Currency is allowed
   *  - Financial period is open
   *  - Manual posting restrictions honored
   */
  async validateJournalBatch(batchId: number): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // 1. Fetch the batch
    const [batch] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Journal batch not found: ${batchId}`);
    }

    // 2. Fetch journal lines
    const lines = await db
      .select()
      .from(schema.glJournalLines)
      .where(eq(schema.glJournalLines.batch_id, batchId))
      .orderBy(schema.glJournalLines.line_no);

    // Check minimum line count
    if (lines.length < 2) {
      errors.push({
        field: 'line_count',
        message: `Batch must have at least 2 journal lines; found ${lines.length}`,
        severity: 'HARD',
      });
    }

    // 3. Check debit/credit balance
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      const amt = toNum(line.base_amount);
      if (line.dr_cr === 'DR') {
        totalDebit += amt;
      } else {
        totalCredit += amt;
      }
    }

    const imbalance = Math.abs(totalDebit - totalCredit);
    if (imbalance > 0.005) {
      errors.push({
        field: 'balance',
        message: `Debit total (${fmt(totalDebit)}) does not equal credit total (${fmt(totalCredit)}); difference: ${fmt(imbalance)}`,
        severity: 'HARD',
      });
    }

    // 4. Validate each line against GL head
    for (const line of lines) {
      const [glHead] = await db
        .select()
        .from(schema.glHeads)
        .where(eq(schema.glHeads.id, line.gl_head_id))
        .limit(1);

      if (!glHead) {
        errors.push({
          line_no: line.line_no,
          field: 'gl_head_id',
          message: `GL head ${line.gl_head_id} does not exist`,
          severity: 'HARD',
        });
        continue;
      }

      // GL head must be OPEN
      if (glHead.account_status !== 'OPEN') {
        errors.push({
          line_no: line.line_no,
          field: 'account_status',
          message: `GL head ${glHead.code} is ${glHead.account_status}; must be OPEN`,
          severity: 'HARD',
        });
      }

      // GL type must match category type
      const [category] = await db
        .select()
        .from(schema.glCategories)
        .where(eq(schema.glCategories.id, glHead.category_id))
        .limit(1);

      if (category && category.category_type !== glHead.gl_type) {
        errors.push({
          line_no: line.line_no,
          field: 'gl_type',
          message: `GL head ${glHead.code} type (${glHead.gl_type}) does not match category type (${category.category_type})`,
          severity: 'HARD',
        });
      }

      // Currency restriction check
      if (glHead.currency_restriction) {
        const allowedCurrencies = glHead.currency_restriction
          .split(',')
          .map((c: string) => c.trim().toUpperCase());
        if (!allowedCurrencies.includes(line.currency.toUpperCase())) {
          errors.push({
            line_no: line.line_no,
            field: 'currency',
            message: `Currency ${line.currency} is not allowed for GL head ${glHead.code}; allowed: ${glHead.currency_restriction}`,
            severity: 'HARD',
          });
        }
      }

      // Manual posting restriction
      if (
        batch.posting_mode === 'MANUAL' &&
        !glHead.is_manual_posting_allowed
      ) {
        // Check if restriction is effective
        const today = todayStr();
        const restrictionFrom = glHead.manual_restriction_effective_from;
        if (!restrictionFrom || restrictionFrom <= today) {
          errors.push({
            line_no: line.line_no,
            field: 'is_manual_posting_allowed',
            message: `Manual posting is not allowed for GL head ${glHead.code}`,
            severity: 'HARD',
          });
        }
      }
    }

    // 5. Financial period check
    if (batch.transaction_date) {
      const [openPeriod] = await db
        .select()
        .from(schema.glFinancialPeriods)
        .where(
          and(
            sql`${schema.glFinancialPeriods.start_date} <= ${batch.transaction_date}`,
            sql`${schema.glFinancialPeriods.end_date} >= ${batch.transaction_date}`,
            eq(schema.glFinancialPeriods.is_closed, false),
          ),
        )
        .limit(1);

      if (!openPeriod) {
        errors.push({
          field: 'financial_period',
          message: `No open financial period covers transaction date ${batch.transaction_date}`,
          severity: 'HARD',
        });
      }
    }

    // 6. Update batch status based on validation result
    const valid = errors.filter((e) => e.severity === 'HARD').length === 0;
    const newStatus = valid ? 'VALIDATED' : 'REJECTED';

    await db
      .update(schema.glJournalBatches)
      .set({
        batch_status: newStatus,
        total_debit: fmt(totalDebit),
        total_credit: fmt(totalCredit),
        rejection_reason: valid
          ? null
          : errors.map((e) => e.message).join('; '),
        updated_at: new Date(),
      })
      .where(eq(schema.glJournalBatches.id, batchId));

    return { valid, errors, batch_id: batchId };
  },

  // =========================================================================
  // 5. authorizeJournalBatch
  // =========================================================================
  /**
   * Handle maker/checker authorization:
   *  - Maker cannot equal checker
   *  - Auto-authorize for trusted interfaces (ONLINE, BATCH, EOD, SOD, etc.)
   *  - Create gl_authorization_tasks record
   *  - Update batch status to AUTHORIZED
   */
  async authorizeJournalBatch(
    batchId: number,
    checkerId: number,
  ): Promise<{
    authorized: boolean;
    auth_task_id: number;
    batch_status: string;
  }> {
    const [batch] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Journal batch not found: ${batchId}`);
    }

    // Only VALIDATED or PENDING_AUTH batches can be authorized
    if (!['VALIDATED', 'PENDING_AUTH'].includes(batch.batch_status)) {
      throw new Error(
        `Batch ${batchId} cannot be authorized in status ${batch.batch_status}; must be VALIDATED or PENDING_AUTH`,
      );
    }

    // Maker/checker separation — maker cannot equal checker
    if (batch.maker_id && batch.maker_id === checkerId) {
      throw new Error(
        `Maker/checker violation: checker (${checkerId}) cannot be the same as maker (${batch.maker_id})`,
      );
    }

    // AUTH-001: Lookup authorization config from matrix
    const amount = Math.max(toNum(batch.total_debit), toNum(batch.total_credit));
    const authConfig = await glAuthorizationService.getAuthorizationConfig(
      'JOURNAL_BATCH',
      'CREATE',
      amount,
    );

    // Trusted interfaces can auto-authorize (no human checker needed)
    const trustedModes = ['ONLINE', 'BATCH', 'EOD', 'SOD', 'MOD', 'NAV_FINALIZATION', 'YEAR_END'];
    const isTrusted = trustedModes.includes(batch.posting_mode);

    // Create authorization task
    const [authTask] = await db
      .insert(schema.glAuthorizationTasks)
      .values({
        object_type: 'JOURNAL_BATCH',
        object_id: batchId,
        action: 'CREATE',
        maker_id: batch.maker_id ?? checkerId,
        checker_id: isTrusted ? null : checkerId,
        auth_status: 'APPROVED',
        reason: isTrusted ? 'Auto-authorized: trusted interface' : `Checker approved (level: ${authConfig?.approval_level ?? 'STANDARD'})`,
        checker_timestamp: new Date(),
      })
      .returning();

    // AUTH-005: Log to authorization audit
    await db.insert(schema.glAuthorizationAuditLog).values({
      auth_task_id: authTask.id,
      object_type: 'JOURNAL_BATCH',
      object_id: batchId,
      action: 'CREATE',
      actor_id: checkerId,
      decision: 'APPROVED',
      reason: isTrusted ? 'Auto-authorized: trusted interface' : 'Checker approved',
      amount: String(amount),
      approval_level: authConfig?.approval_level ?? 'STANDARD',
    });

    // Update batch status to AUTHORIZED
    await db
      .update(schema.glJournalBatches)
      .set({
        batch_status: 'AUTHORIZED',
        checker_id: isTrusted ? null : checkerId,
        authorized_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.glJournalBatches.id, batchId));

    return {
      authorized: true,
      auth_task_id: authTask.id,
      batch_status: 'AUTHORIZED',
    };
  },

  // =========================================================================
  // 6. postJournalBatch
  // =========================================================================
  /**
   * Atomically post a journal batch:
   *  - Set posting_date to now
   *  - Update batch status to POSTED
   *  - Update gl_ledger_balances (upsert: add debits, subtract credits)
   *  - Write gl_audit_log
   *  - Return posted batch reference
   */
  async postJournalBatch(batchId: number): Promise<{
    batch_id: number;
    batch_ref: string;
    posting_date: Date;
    total_debit: string;
    total_credit: string;
    line_count: number;
  }> {
    const [batch] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Journal batch not found: ${batchId}`);
    }

    if (batch.batch_status !== 'AUTHORIZED') {
      throw new Error(
        `Batch ${batchId} cannot be posted in status ${batch.batch_status}; must be AUTHORIZED`,
      );
    }

    const lines = await db
      .select()
      .from(schema.glJournalLines)
      .where(eq(schema.glJournalLines.batch_id, batchId))
      .orderBy(schema.glJournalLines.line_no);

    const postingDate = new Date();
    const balanceDate = todayStr();

    // Atomic transaction: post batch + update balances + write audit
    const postedBatch = await db.transaction(async (tx: any) => {
      // 1. Update batch status to POSTED
      const [updated] = await tx
        .update(schema.glJournalBatches)
        .set({
          batch_status: 'POSTED',
          posting_date: postingDate,
          updated_at: postingDate,
        })
        .where(eq(schema.glJournalBatches.id, batchId))
        .returning();

      // 2. Update ledger balances for each line
      for (const line of lines) {
        const amt = toNum(line.base_amount);
        const debitDelta = line.dr_cr === 'DR' ? amt : 0;
        const creditDelta = line.dr_cr === 'CR' ? amt : 0;
        // Net effect: debits add to balance, credits subtract
        const netDelta = debitDelta - creditDelta;

        // Try to find existing balance row
        const [existingBalance] = await tx
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, line.gl_head_id),
              eq(schema.glLedgerBalances.accounting_unit_id, batch.accounting_unit_id),
              eq(schema.glLedgerBalances.currency, line.currency),
              eq(schema.glLedgerBalances.balance_date, balanceDate),
            ),
          )
          .limit(1);

        if (existingBalance) {
          // Update existing balance
          await tx
            .update(schema.glLedgerBalances)
            .set({
              debit_turnover: fmt(toNum(existingBalance.debit_turnover) + debitDelta),
              credit_turnover: fmt(toNum(existingBalance.credit_turnover) + creditDelta),
              closing_balance: fmt(toNum(existingBalance.closing_balance) + netDelta),
              last_posting_ref: batch.batch_ref,
              updated_at: postingDate,
            })
            .where(eq(schema.glLedgerBalances.id, existingBalance.id));
        } else {
          // Find the most recent prior balance to carry forward opening
          const [priorBalance] = await tx
            .select()
            .from(schema.glLedgerBalances)
            .where(
              and(
                eq(schema.glLedgerBalances.gl_head_id, line.gl_head_id),
                eq(schema.glLedgerBalances.accounting_unit_id, batch.accounting_unit_id),
                eq(schema.glLedgerBalances.currency, line.currency),
                sql`${schema.glLedgerBalances.balance_date} < ${balanceDate}`,
              ),
            )
            .orderBy(desc(schema.glLedgerBalances.balance_date))
            .limit(1);

          const openingBalance = priorBalance ? toNum(priorBalance.closing_balance) : 0;

          await tx.insert(schema.glLedgerBalances).values({
            gl_head_id: line.gl_head_id,
            accounting_unit_id: batch.accounting_unit_id,
            currency: line.currency,
            balance_date: balanceDate,
            opening_balance: fmt(openingBalance),
            debit_turnover: fmt(debitDelta),
            credit_turnover: fmt(creditDelta),
            closing_balance: fmt(openingBalance + netDelta),
            last_posting_ref: batch.batch_ref,
          });
        }
      }

      // 3. Write audit log
      await tx.insert(schema.glAuditLog).values({
        action: 'POST',
        object_type: 'JOURNAL_BATCH',
        object_id: batchId,
        user_id: batch.checker_id ?? batch.maker_id,
        new_values: {
          batch_ref: batch.batch_ref,
          total_debit: batch.total_debit,
          total_credit: batch.total_credit,
          line_count: batch.line_count,
          posting_date: postingDate.toISOString(),
        } as Record<string, unknown>,
        rule_version: batch.rule_version,
      });

      return updated;
    });

    return {
      batch_id: postedBatch.id,
      batch_ref: postedBatch.batch_ref,
      posting_date: postingDate,
      total_debit: postedBatch.total_debit,
      total_credit: postedBatch.total_credit,
      line_count: postedBatch.line_count,
    };
  },

  // =========================================================================
  // 7. cancelJournalBatch
  // =========================================================================
  /**
   * Cancel a posted journal batch by creating a compensating (reversal) batch:
   *  - Reverse all lines (DR -> CR, CR -> DR)
   *  - Create a reversal link
   *  - Post the cancellation batch
   */
  async cancelJournalBatch(
    batchId: number,
    reason: string,
    userId: number,
  ): Promise<{
    original_batch_id: number;
    reversal_batch_id: number;
    reversal_batch_ref: string;
  }> {
    // 1. Fetch the original batch
    const [original] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!original) {
      throw new Error(`Journal batch not found: ${batchId}`);
    }

    if (original.batch_status !== 'POSTED') {
      throw new Error(
        `Only POSTED batches can be cancelled; batch ${batchId} is ${original.batch_status}`,
      );
    }

    // BR-008: System journals cannot be cancelled
    const isSystem = await glAuthorizationService.isSystemJournal(batchId);
    if (isSystem) {
      throw new Error(
        `System-generated journal batch ${batchId} (mode: ${original.posting_mode}) cannot be cancelled`,
      );
    }

    // 2. Fetch original lines
    const originalLines = await db
      .select()
      .from(schema.glJournalLines)
      .where(eq(schema.glJournalLines.batch_id, batchId))
      .orderBy(schema.glJournalLines.line_no);

    // 3. Create compensating batch + reversed lines + reversal link, then post
    const reversalRef = generateBatchRef();
    const postingDate = new Date();
    const balanceDate = todayStr();

    const result = await db.transaction(async (tx: any) => {
      // Create the reversal batch header
      const [reversalBatch] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: reversalRef,
          source_system: original.source_system,
          source_event_id: original.source_event_id,
          event_code: original.event_code,
          rule_version: original.rule_version,
          posting_mode: original.posting_mode,
          accounting_unit_id: original.accounting_unit_id,
          transaction_date: todayStr(),
          value_date: todayStr(),
          posting_date: postingDate,
          batch_status: 'POSTED',
          total_debit: original.total_credit, // Swap debit/credit
          total_credit: original.total_debit,
          line_count: originalLines.length,
          narration: `Cancellation of ${original.batch_ref}: ${reason}`,
          fund_id: original.fund_id,
          maker_id: userId,
        })
        .returning();

      // Create reversed journal lines (DR -> CR, CR -> DR)
      for (const line of originalLines) {
        const reversedDrCr: 'DR' | 'CR' = line.dr_cr === 'DR' ? 'CR' : 'DR';

        await tx.insert(schema.glJournalLines).values({
          batch_id: reversalBatch.id,
          line_no: line.line_no,
          dr_cr: reversedDrCr,
          gl_head_id: line.gl_head_id,
          gl_access_code: line.gl_access_code,
          amount: line.amount,
          currency: line.currency,
          base_currency: line.base_currency,
          base_amount: line.base_amount,
          fund_id: line.fund_id,
          portfolio_id: line.portfolio_id,
          security_id: line.security_id,
          counterparty_id: line.counterparty_id,
          narration: `Reversal of line ${line.line_no}: ${line.narration ?? ''}`,
        });

        // Update ledger balances for the reversal
        const amt = toNum(line.base_amount);
        // Reversed: original DR becomes CR and vice versa
        const debitDelta = reversedDrCr === 'DR' ? amt : 0;
        const creditDelta = reversedDrCr === 'CR' ? amt : 0;
        const netDelta = debitDelta - creditDelta;

        const [existingBalance] = await tx
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, line.gl_head_id),
              eq(schema.glLedgerBalances.accounting_unit_id, original.accounting_unit_id),
              eq(schema.glLedgerBalances.currency, line.currency),
              eq(schema.glLedgerBalances.balance_date, balanceDate),
            ),
          )
          .limit(1);

        if (existingBalance) {
          await tx
            .update(schema.glLedgerBalances)
            .set({
              debit_turnover: fmt(toNum(existingBalance.debit_turnover) + debitDelta),
              credit_turnover: fmt(toNum(existingBalance.credit_turnover) + creditDelta),
              closing_balance: fmt(toNum(existingBalance.closing_balance) + netDelta),
              last_posting_ref: reversalRef,
              updated_at: postingDate,
            })
            .where(eq(schema.glLedgerBalances.id, existingBalance.id));
        } else {
          const [priorBalance] = await tx
            .select()
            .from(schema.glLedgerBalances)
            .where(
              and(
                eq(schema.glLedgerBalances.gl_head_id, line.gl_head_id),
                eq(schema.glLedgerBalances.accounting_unit_id, original.accounting_unit_id),
                eq(schema.glLedgerBalances.currency, line.currency),
                sql`${schema.glLedgerBalances.balance_date} < ${balanceDate}`,
              ),
            )
            .orderBy(desc(schema.glLedgerBalances.balance_date))
            .limit(1);

          const openingBalance = priorBalance ? toNum(priorBalance.closing_balance) : 0;

          await tx.insert(schema.glLedgerBalances).values({
            gl_head_id: line.gl_head_id,
            accounting_unit_id: original.accounting_unit_id,
            currency: line.currency,
            balance_date: balanceDate,
            opening_balance: fmt(openingBalance),
            debit_turnover: fmt(debitDelta),
            credit_turnover: fmt(creditDelta),
            closing_balance: fmt(openingBalance + netDelta),
            last_posting_ref: reversalRef,
          });
        }
      }

      // Create reversal link
      await tx.insert(schema.glReversalLinks).values({
        original_batch_id: batchId,
        reversal_batch_id: reversalBatch.id,
        reversal_type: 'CANCELLATION',
        reversal_reason: reason,
        approved_by: userId,
        approved_at: postingDate,
      });

      // Mark the original batch as CANCELLED
      await tx
        .update(schema.glJournalBatches)
        .set({
          batch_status: 'CANCELLED',
          updated_at: postingDate,
        })
        .where(eq(schema.glJournalBatches.id, batchId));

      // Write audit log
      await tx.insert(schema.glAuditLog).values({
        action: 'CANCEL',
        object_type: 'JOURNAL_BATCH',
        object_id: batchId,
        user_id: userId,
        old_values: { batch_ref: original.batch_ref, batch_status: 'POSTED' } as Record<string, unknown>,
        new_values: {
          batch_status: 'CANCELLED',
          reversal_batch_ref: reversalRef,
          reason,
        } as Record<string, unknown>,
      });

      return reversalBatch;
    });

    return {
      original_batch_id: batchId,
      reversal_batch_id: result.id,
      reversal_batch_ref: result.batch_ref,
    };
  },

  // =========================================================================
  // 8. getJournalBatch
  // =========================================================================
  /**
   * Return a journal batch with its lines joined.
   */
  async getJournalBatch(batchId: number) {
    const [batch] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new Error(`Journal batch not found: ${batchId}`);
    }

    const lines = await db
      .select({
        id: schema.glJournalLines.id,
        batch_id: schema.glJournalLines.batch_id,
        line_no: schema.glJournalLines.line_no,
        dr_cr: schema.glJournalLines.dr_cr,
        gl_head_id: schema.glJournalLines.gl_head_id,
        gl_head_code: schema.glHeads.code,
        gl_head_name: schema.glHeads.name,
        gl_access_code: schema.glJournalLines.gl_access_code,
        amount: schema.glJournalLines.amount,
        currency: schema.glJournalLines.currency,
        base_currency: schema.glJournalLines.base_currency,
        base_amount: schema.glJournalLines.base_amount,
        fund_id: schema.glJournalLines.fund_id,
        portfolio_id: schema.glJournalLines.portfolio_id,
        security_id: schema.glJournalLines.security_id,
        counterparty_id: schema.glJournalLines.counterparty_id,
        narration: schema.glJournalLines.narration,
      })
      .from(schema.glJournalLines)
      .leftJoin(schema.glHeads, eq(schema.glJournalLines.gl_head_id, schema.glHeads.id))
      .where(eq(schema.glJournalLines.batch_id, batchId))
      .orderBy(schema.glJournalLines.line_no);

    // Check for reversal links
    const reversalLinks = await db
      .select()
      .from(schema.glReversalLinks)
      .where(eq(schema.glReversalLinks.original_batch_id, batchId));

    const reversedBy = await db
      .select()
      .from(schema.glReversalLinks)
      .where(eq(schema.glReversalLinks.reversal_batch_id, batchId));

    return {
      ...batch,
      lines,
      reversal_links: reversalLinks,
      reversed_by: reversedBy.length > 0 ? reversedBy[0] : null,
    };
  },

  // =========================================================================
  // 9. getGlDrilldown
  // =========================================================================
  /**
   * Drilldown query by accounting_unit_id, gl_access_code, date range.
   * Returns opening balance, debit/credit turnover, closing balance,
   * and journal line details.
   */
  async getGlDrilldown(params: {
    accountingUnitId: number;
    glAccessCode?: string;
    glHeadId?: number;
    fromDate: string;
    toDate: string;
    currency?: string;
  }) {
    // 1. Get the opening balance (balance as of the day before fromDate)
    const openingConditions = [
      eq(schema.glLedgerBalances.accounting_unit_id, params.accountingUnitId),
      sql`${schema.glLedgerBalances.balance_date} < ${params.fromDate}`,
    ];
    if (params.glHeadId) {
      openingConditions.push(eq(schema.glLedgerBalances.gl_head_id, params.glHeadId));
    }
    if (params.currency) {
      openingConditions.push(eq(schema.glLedgerBalances.currency, params.currency));
    }

    const [openingRow] = await db
      .select({
        closing_balance: schema.glLedgerBalances.closing_balance,
      })
      .from(schema.glLedgerBalances)
      .where(and(...openingConditions))
      .orderBy(desc(schema.glLedgerBalances.balance_date))
      .limit(1);

    const openingBalance = openingRow ? toNum(openingRow.closing_balance) : 0;

    // 2. Aggregate turnover within the date range
    const turnoverConditions = [
      eq(schema.glLedgerBalances.accounting_unit_id, params.accountingUnitId),
      sql`${schema.glLedgerBalances.balance_date} >= ${params.fromDate}`,
      sql`${schema.glLedgerBalances.balance_date} <= ${params.toDate}`,
    ];
    if (params.glHeadId) {
      turnoverConditions.push(eq(schema.glLedgerBalances.gl_head_id, params.glHeadId));
    }
    if (params.currency) {
      turnoverConditions.push(eq(schema.glLedgerBalances.currency, params.currency));
    }

    const [turnoverRow] = await db
      .select({
        total_debit: sql<string>`COALESCE(SUM(CAST(${schema.glLedgerBalances.debit_turnover} AS NUMERIC)), 0)`,
        total_credit: sql<string>`COALESCE(SUM(CAST(${schema.glLedgerBalances.credit_turnover} AS NUMERIC)), 0)`,
      })
      .from(schema.glLedgerBalances)
      .where(and(...turnoverConditions));

    const debitTurnover = toNum(turnoverRow?.total_debit);
    const creditTurnover = toNum(turnoverRow?.total_credit);
    const closingBalance = openingBalance + debitTurnover - creditTurnover;

    // 3. Fetch journal line details within the date range
    const lineConditions = [
      eq(schema.glJournalBatches.accounting_unit_id, params.accountingUnitId),
      eq(schema.glJournalBatches.batch_status, 'POSTED'),
      sql`${schema.glJournalBatches.transaction_date} >= ${params.fromDate}`,
      sql`${schema.glJournalBatches.transaction_date} <= ${params.toDate}`,
    ];

    let journalDetails = await db
      .select({
        batch_id: schema.glJournalBatches.id,
        batch_ref: schema.glJournalBatches.batch_ref,
        transaction_date: schema.glJournalBatches.transaction_date,
        value_date: schema.glJournalBatches.value_date,
        posting_date: schema.glJournalBatches.posting_date,
        event_code: schema.glJournalBatches.event_code,
        line_id: schema.glJournalLines.id,
        line_no: schema.glJournalLines.line_no,
        dr_cr: schema.glJournalLines.dr_cr,
        gl_head_id: schema.glJournalLines.gl_head_id,
        gl_access_code: schema.glJournalLines.gl_access_code,
        amount: schema.glJournalLines.amount,
        currency: schema.glJournalLines.currency,
        base_amount: schema.glJournalLines.base_amount,
        narration: schema.glJournalLines.narration,
      })
      .from(schema.glJournalLines)
      .innerJoin(
        schema.glJournalBatches,
        eq(schema.glJournalLines.batch_id, schema.glJournalBatches.id),
      )
      .where(and(...lineConditions))
      .orderBy(schema.glJournalBatches.transaction_date, schema.glJournalLines.line_no);

    // Apply additional filters on lines if specified
    if (params.glHeadId) {
      journalDetails = journalDetails.filter((l: any) => l.gl_head_id === params.glHeadId);
    }
    if (params.glAccessCode) {
      journalDetails = journalDetails.filter((l: any) => l.gl_access_code === params.glAccessCode);
    }
    if (params.currency) {
      journalDetails = journalDetails.filter(
        (l: any) => l.currency.toUpperCase() === params.currency!.toUpperCase(),
      );
    }

    return {
      accounting_unit_id: params.accountingUnitId,
      gl_head_id: params.glHeadId ?? null,
      gl_access_code: params.glAccessCode ?? null,
      from_date: params.fromDate,
      to_date: params.toDate,
      currency: params.currency ?? 'ALL',
      opening_balance: fmt(openingBalance),
      debit_turnover: fmt(debitTurnover),
      credit_turnover: fmt(creditTurnover),
      closing_balance: fmt(closingBalance),
      journal_lines: journalDetails,
    };
  },

  // =========================================================================
  // 10. rebuildBalances
  // =========================================================================
  /**
   * Rebuild ledger balances from journal lines for a given GL head,
   * accounting unit, and from a specific date. Used for audit/reconciliation.
   */
  async rebuildBalances(
    glHeadId: number,
    accountingUnitId: number,
    fromDate: string,
  ): Promise<{
    gl_head_id: number;
    accounting_unit_id: number;
    dates_rebuilt: number;
    final_balance: string;
  }> {
    // 1. Get the opening balance as of the day before fromDate
    const [priorBalance] = await db
      .select()
      .from(schema.glLedgerBalances)
      .where(
        and(
          eq(schema.glLedgerBalances.gl_head_id, glHeadId),
          eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
          sql`${schema.glLedgerBalances.balance_date} < ${fromDate}`,
        ),
      )
      .orderBy(desc(schema.glLedgerBalances.balance_date))
      .limit(1);

    let runningBalance = priorBalance ? toNum(priorBalance.closing_balance) : 0;

    // 2. Get all posted journal lines for this GL head + accounting unit from fromDate onward
    const lines = await db
      .select({
        transaction_date: schema.glJournalBatches.transaction_date,
        dr_cr: schema.glJournalLines.dr_cr,
        base_amount: schema.glJournalLines.base_amount,
        currency: schema.glJournalLines.currency,
        batch_ref: schema.glJournalBatches.batch_ref,
      })
      .from(schema.glJournalLines)
      .innerJoin(
        schema.glJournalBatches,
        eq(schema.glJournalLines.batch_id, schema.glJournalBatches.id),
      )
      .where(
        and(
          eq(schema.glJournalLines.gl_head_id, glHeadId),
          eq(schema.glJournalBatches.accounting_unit_id, accountingUnitId),
          eq(schema.glJournalBatches.batch_status, 'POSTED'),
          sql`${schema.glJournalBatches.transaction_date} >= ${fromDate}`,
        ),
      )
      .orderBy(schema.glJournalBatches.transaction_date);

    // 3. Group by date and rebuild
    const dateMap = new Map<
      string,
      { debit: number; credit: number; lastRef: string; currency: string }
    >();

    for (const line of lines) {
      const dateKey = line.transaction_date;
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { debit: 0, credit: 0, lastRef: '', currency: line.currency });
      }
      const entry = dateMap.get(dateKey)!;
      const amt = toNum(line.base_amount);
      if (line.dr_cr === 'DR') {
        entry.debit += amt;
      } else {
        entry.credit += amt;
      }
      entry.lastRef = line.batch_ref;
    }

    // 4. Sort dates and upsert balances
    const sortedDates = Array.from(dateMap.keys()).sort();

    await db.transaction(async (tx: any) => {
      // Delete existing balance rows for this dimension from fromDate onward
      await tx
        .delete(schema.glLedgerBalances)
        .where(
          and(
            eq(schema.glLedgerBalances.gl_head_id, glHeadId),
            eq(schema.glLedgerBalances.accounting_unit_id, accountingUnitId),
            sql`${schema.glLedgerBalances.balance_date} >= ${fromDate}`,
          ),
        );

      // Re-insert rebuilt balances
      for (const dateKey of sortedDates) {
        const entry = dateMap.get(dateKey)!;
        const openingForDate = runningBalance;
        const netDelta = entry.debit - entry.credit;
        runningBalance += netDelta;

        await tx.insert(schema.glLedgerBalances).values({
          gl_head_id: glHeadId,
          accounting_unit_id: accountingUnitId,
          currency: entry.currency,
          balance_date: dateKey,
          opening_balance: fmt(openingForDate),
          debit_turnover: fmt(entry.debit),
          credit_turnover: fmt(entry.credit),
          closing_balance: fmt(runningBalance),
          last_posting_ref: entry.lastRef,
        });
      }

      // Write audit log for the rebuild
      await tx.insert(schema.glAuditLog).values({
        action: 'REBUILD_BALANCE',
        object_type: 'GL_LEDGER_BALANCE',
        object_id: glHeadId,
        new_values: {
          accounting_unit_id: accountingUnitId,
          from_date: fromDate,
          dates_rebuilt: sortedDates.length,
          final_balance: fmt(runningBalance),
        } as Record<string, unknown>,
      });
    });

    return {
      gl_head_id: glHeadId,
      accounting_unit_id: accountingUnitId,
      dates_rebuilt: sortedDates.length,
      final_balance: fmt(runningBalance),
    };
  },

  // =========================================================================
  // 11. createManualJournal
  // =========================================================================
  /**
   * Create a manual journal batch that requires maker/checker authorization.
   * Accepts an array of lines with dr_cr, gl_head_id, amount, currency, narration.
   * Validates and creates in PENDING_AUTH status.
   */
  async createManualJournal(params: {
    makerId: number;
    accountingUnitId: number;
    transactionDate: string;
    valueDate: string;
    narration: string;
    fundId?: number;
    lines: Array<{
      dr_cr: 'DR' | 'CR';
      gl_head_id: number;
      amount: string;
      currency: string;
      narration?: string;
      gl_access_code?: string;
      fund_id?: number;
      portfolio_id?: number;
      security_id?: number;
      counterparty_id?: number;
    }>;
  }): Promise<{
    batch_id: number;
    batch_ref: string;
    batch_status: string;
    validation: ValidationResult;
  }> {
    // Pre-validation: at least 2 lines
    if (params.lines.length < 2) {
      throw new Error('Manual journal must have at least 2 lines');
    }

    // Pre-validation: debit must equal credit
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of params.lines) {
      const amt = toNum(line.amount);
      if (amt <= 0) {
        throw new Error(`Line amount must be positive; got ${line.amount}`);
      }
      if (line.dr_cr === 'DR') {
        totalDebit += amt;
      } else {
        totalCredit += amt;
      }
    }

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `Debit total (${fmt(totalDebit)}) must equal credit total (${fmt(totalCredit)})`,
      );
    }

    const batchRef = generateBatchRef();

    // Create batch and lines
    const batch = await db.transaction(async (tx: any) => {
      const [batchRow] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: batchRef,
          source_system: 'MANUAL',
          posting_mode: 'MANUAL',
          accounting_unit_id: params.accountingUnitId,
          transaction_date: params.transactionDate,
          value_date: params.valueDate,
          batch_status: 'DRAFT', // Will be validated then set to PENDING_AUTH
          total_debit: fmt(totalDebit),
          total_credit: fmt(totalCredit),
          line_count: params.lines.length,
          narration: params.narration,
          fund_id: params.fundId ?? null,
          maker_id: params.makerId,
        })
        .returning();

      for (let i = 0; i < params.lines.length; i++) {
        const line = params.lines[i];
        await tx.insert(schema.glJournalLines).values({
          batch_id: batchRow.id,
          line_no: i + 1,
          dr_cr: line.dr_cr,
          gl_head_id: line.gl_head_id,
          gl_access_code: line.gl_access_code ?? null,
          amount: line.amount,
          currency: line.currency,
          base_currency: 'PHP',
          base_amount: line.amount, // Assumes PHP or 1:1 for now
          fund_id: line.fund_id ?? params.fundId ?? null,
          portfolio_id: line.portfolio_id ?? null,
          security_id: line.security_id ?? null,
          counterparty_id: line.counterparty_id ?? null,
          narration: line.narration ?? null,
        });
      }

      // Write audit log
      await tx.insert(schema.glAuditLog).values({
        action: 'CREATE',
        object_type: 'JOURNAL_BATCH',
        object_id: batchRow.id,
        user_id: params.makerId,
        new_values: {
          batch_ref: batchRef,
          posting_mode: 'MANUAL',
          total_debit: fmt(totalDebit),
          total_credit: fmt(totalCredit),
          line_count: params.lines.length,
        } as Record<string, unknown>,
      });

      return batchRow;
    });

    // Run validation
    const validation = await this.validateJournalBatch(batch.id);

    // If validation passed, set status to PENDING_AUTH (requires checker)
    if (validation.valid) {
      await db
        .update(schema.glJournalBatches)
        .set({
          batch_status: 'PENDING_AUTH',
          updated_at: new Date(),
        })
        .where(eq(schema.glJournalBatches.id, batch.id));
    }

    return {
      batch_id: batch.id,
      batch_ref: batchRef,
      batch_status: validation.valid ? 'PENDING_AUTH' : 'REJECTED',
      validation,
    };
  },

  // =========================================================================
  // 12. processPostingPipeline
  // =========================================================================
  /**
   * Full end-to-end pipeline:
   *   Submit Event -> Resolve Intent -> Generate Journal -> Validate ->
   *   Auto-Authorize (if trusted) -> Post
   *
   * Returns the result of each stage.
   */
  async processPostingPipeline(eventPayload: {
    sourceSystem: string;
    sourceReference: string;
    idempotencyKey: string;
    eventCode: string;
    payload: Record<string, unknown>;
    businessDate: string;
    autoAuthorizeUserId?: number;
  }): Promise<{
    event_id: number;
    intent_id: number;
    batch_id: number | null;
    batch_ref: string | null;
    batch_status: string;
    posted: boolean;
    errors: string[];
    duplicate: boolean;
  }> {
    const errors: string[] = [];
    let batchId: number | null = null;
    let batchRef: string | null = null;
    let batchStatus = 'UNKNOWN';
    let posted = false;

    // Stage 1: Submit business event
    const { event_id, duplicate } = await this.submitBusinessEvent({
      sourceSystem: eventPayload.sourceSystem,
      sourceReference: eventPayload.sourceReference,
      idempotencyKey: eventPayload.idempotencyKey,
      eventCode: eventPayload.eventCode,
      eventPayload: eventPayload.payload,
      businessDate: eventPayload.businessDate,
    });

    if (duplicate) {
      // Event already processed — find the existing batch
      const [existingIntent] = await db
        .select()
        .from(schema.glAccountingIntents)
        .where(eq(schema.glAccountingIntents.event_id, event_id))
        .orderBy(desc(schema.glAccountingIntents.id))
        .limit(1);

      if (existingIntent) {
        const [existingBatch] = await db
          .select()
          .from(schema.glJournalBatches)
          .where(eq(schema.glJournalBatches.source_event_id, event_id))
          .orderBy(desc(schema.glJournalBatches.id))
          .limit(1);

        return {
          event_id,
          intent_id: existingIntent.id,
          batch_id: existingBatch?.id ?? null,
          batch_ref: existingBatch?.batch_ref ?? null,
          batch_status: existingBatch?.batch_status ?? existingIntent.intent_status,
          posted: existingBatch?.batch_status === 'POSTED',
          errors: [],
          duplicate: true,
        };
      }
    }

    // Stage 2: Resolve accounting intent
    let intentId: number;
    try {
      const intentResult = await this.resolveAccountingIntent(event_id);
      intentId = intentResult.intent_id;

      if (!intentResult.rule_set_id) {
        errors.push('Failed to resolve accounting intent: no matching rule set');
        return {
          event_id,
          intent_id: intentId,
          batch_id: null,
          batch_ref: null,
          batch_status: 'FAILED',
          posted: false,
          errors,
          duplicate: false,
        };
      }
    } catch (err) {
      errors.push(`Intent resolution error: ${(err as Error).message}`);
      return {
        event_id,
        intent_id: 0,
        batch_id: null,
        batch_ref: null,
        batch_status: 'FAILED',
        posted: false,
        errors,
        duplicate: false,
      };
    }

    // Stage 3: Generate journal batch
    try {
      const batchResult = await this.generateJournalBatch(intentId);
      batchId = batchResult.batch_id;
      batchRef = batchResult.batch_ref;
      batchStatus = 'DRAFT';
    } catch (err) {
      errors.push(`Journal generation error: ${(err as Error).message}`);

      // Update intent status to FAILED
      await db
        .update(schema.glAccountingIntents)
        .set({ intent_status: 'FAILED', error_message: (err as Error).message, updated_at: new Date() })
        .where(eq(schema.glAccountingIntents.id, intentId));

      return {
        event_id,
        intent_id: intentId,
        batch_id: null,
        batch_ref: null,
        batch_status: 'FAILED',
        posted: false,
        errors,
        duplicate: false,
      };
    }

    // Stage 4: Validate
    try {
      const validation = await this.validateJournalBatch(batchId);
      if (!validation.valid) {
        const validationErrors = validation.errors.map((e) => e.message);
        errors.push(...validationErrors);
        batchStatus = 'REJECTED';

        // Log the posting exception
        await db.insert(schema.glPostingExceptions).values({
          event_id: event_id,
          batch_id: batchId,
          source_system: eventPayload.sourceSystem,
          exception_category: 'VALIDATION_ERROR',
          error_message: validationErrors.join('; '),
          business_date: eventPayload.businessDate,
          retry_eligible: true,
        });

        return {
          event_id,
          intent_id: intentId,
          batch_id: batchId,
          batch_ref: batchRef,
          batch_status: batchStatus,
          posted: false,
          errors,
          duplicate: false,
        };
      }
      batchStatus = 'VALIDATED';
    } catch (err) {
      errors.push(`Validation error: ${(err as Error).message}`);
      return {
        event_id,
        intent_id: intentId,
        batch_id: batchId,
        batch_ref: batchRef,
        batch_status: 'FAILED',
        posted: false,
        errors,
        duplicate: false,
      };
    }

    // Stage 5: Auto-authorize (for trusted interfaces)
    const authUserId = eventPayload.autoAuthorizeUserId ?? 1; // System user
    try {
      await this.authorizeJournalBatch(batchId, authUserId);
      batchStatus = 'AUTHORIZED';
    } catch (err) {
      errors.push(`Authorization error: ${(err as Error).message}`);
      return {
        event_id,
        intent_id: intentId,
        batch_id: batchId,
        batch_ref: batchRef,
        batch_status: 'VALIDATED',
        posted: false,
        errors,
        duplicate: false,
      };
    }

    // Stage 6: Post
    try {
      const postResult = await this.postJournalBatch(batchId);
      batchStatus = 'POSTED';
      posted = true;

      // Update intent status to POSTED
      await db
        .update(schema.glAccountingIntents)
        .set({ intent_status: 'POSTED', updated_at: new Date() })
        .where(eq(schema.glAccountingIntents.id, intentId));

      return {
        event_id,
        intent_id: intentId,
        batch_id: postResult.batch_id,
        batch_ref: postResult.batch_ref,
        batch_status: 'POSTED',
        posted: true,
        errors: [],
        duplicate: false,
      };
    } catch (err) {
      errors.push(`Posting error: ${(err as Error).message}`);

      await db.insert(schema.glPostingExceptions).values({
        event_id: event_id,
        batch_id: batchId,
        source_system: eventPayload.sourceSystem,
        exception_category: 'SYSTEM_ERROR',
        error_message: (err as Error).message,
        business_date: eventPayload.businessDate,
        retry_eligible: true,
      });

      return {
        event_id,
        intent_id: intentId,
        batch_id: batchId,
        batch_ref: batchRef,
        batch_status: 'AUTHORIZED',
        posted: false,
        errors,
        duplicate: false,
      };
    }
  },

  // =========================================================================
  // POST-008: Inter-entity journal (multiple accounting units)
  // =========================================================================

  async createInterEntityJournal(params: {
    entries: Array<{
      accounting_unit_id: number;
      gl_head_id: number;
      dr_cr: 'DR' | 'CR';
      amount: number;
      currency?: string;
      narration?: string;
      fund_id?: number;
    }>;
    businessDate: string;
    narration: string;
    userId: number;
  }): Promise<{
    batch_ids: number[];
    inter_unit_groups: Record<number, number[]>;
    total_debit: number;
    total_credit: number;
  }> {
    // Validate DR = CR across all units
    let totalDebit = 0;
    let totalCredit = 0;
    for (const entry of params.entries) {
      if (entry.dr_cr === 'DR') totalDebit += entry.amount;
      else totalCredit += entry.amount;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `Inter-entity journal imbalance: total debit ${fmt(totalDebit)} ≠ total credit ${fmt(totalCredit)}`,
      );
    }

    // Group by accounting_unit_id
    const unitGroups = new Map<number, typeof params.entries>();
    for (const entry of params.entries) {
      const group = unitGroups.get(entry.accounting_unit_id) ?? [];
      group.push(entry);
      unitGroups.set(entry.accounting_unit_id, group);
    }

    const batchIds: number[] = [];
    const interUnitGroups: Record<number, number[]> = {};

    // Create a batch per accounting unit
    for (const [unitId, entries] of unitGroups) {
      const batchRef = generateBatchRef();
      let unitDebit = 0;
      let unitCredit = 0;

      const journalLines: Array<{
        line_no: number;
        dr_cr: 'DR' | 'CR';
        gl_head_id: number;
        amount: string;
        currency: string;
        base_amount: string;
        narration: string | null;
        fund_id: number | null;
      }> = [];

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.dr_cr === 'DR') unitDebit += e.amount;
        else unitCredit += e.amount;

        journalLines.push({
          line_no: i + 1,
          dr_cr: e.dr_cr,
          gl_head_id: e.gl_head_id,
          amount: fmt(e.amount),
          currency: e.currency ?? 'PHP',
          base_amount: fmt(e.amount),
          narration: e.narration ?? null,
          fund_id: e.fund_id ?? null,
        });
      }

      const result = await db.transaction(async (tx: any) => {
        const [batch] = await tx
          .insert(schema.glJournalBatches)
          .values({
            batch_ref: batchRef,
            source_system: 'INTER_ENTITY',
            posting_mode: 'MANUAL',
            accounting_unit_id: unitId,
            transaction_date: params.businessDate,
            value_date: params.businessDate,
            batch_status: 'DRAFT',
            total_debit: fmt(unitDebit),
            total_credit: fmt(unitCredit),
            line_count: journalLines.length,
            narration: `Inter-entity: ${params.narration}`,
            maker_id: params.userId,
            is_interunit: true,
          })
          .returning();

        for (const line of journalLines) {
          await tx.insert(schema.glJournalLines).values({
            batch_id: batch.id,
            line_no: line.line_no,
            dr_cr: line.dr_cr,
            gl_head_id: line.gl_head_id,
            amount: line.amount,
            currency: line.currency,
            base_currency: 'PHP',
            base_amount: line.base_amount,
            narration: line.narration,
            fund_id: line.fund_id,
          });
        }

        return batch;
      });

      batchIds.push(result.id);
      interUnitGroups[unitId] = [result.id];
    }

    return {
      batch_ids: batchIds,
      inter_unit_groups: interUnitGroups,
      total_debit: totalDebit,
      total_credit: totalCredit,
    };
  },

  // =========================================================================
  // REV-001: Partial reversal (cancel specific lines only)
  // =========================================================================

  async partialReverseBatch(
    batchId: number,
    lineFilter: number[],
    reason: string,
    userId: number,
  ): Promise<{
    original_batch_id: number;
    reversal_batch_id: number;
    lines_reversed: number;
  }> {
    const [original] = await db
      .select()
      .from(schema.glJournalBatches)
      .where(eq(schema.glJournalBatches.id, batchId))
      .limit(1);

    if (!original) throw new Error(`Journal batch not found: ${batchId}`);
    if (original.batch_status !== 'POSTED') {
      throw new Error(`Only POSTED batches can be reversed; batch ${batchId} is ${original.batch_status}`);
    }

    // Get only the filtered lines
    const allLines = await db
      .select()
      .from(schema.glJournalLines)
      .where(eq(schema.glJournalLines.batch_id, batchId))
      .orderBy(schema.glJournalLines.line_no);

    const linesToReverse = allLines.filter((l: { line_no: number }) => lineFilter.includes(l.line_no));
    if (linesToReverse.length === 0) {
      throw new Error(`No matching lines found for line numbers: ${lineFilter.join(', ')}`);
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of linesToReverse) {
      const amt = toNum(line.base_amount);
      if (line.dr_cr === 'DR') totalCredit += amt;
      else totalDebit += amt;
    }

    const reversalRef = generateBatchRef();
    const postingDate = new Date();
    const balanceDate = todayStr();

    const result = await db.transaction(async (tx: any) => {
      const [reversalBatch] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: reversalRef,
          source_system: original.source_system,
          source_event_id: original.source_event_id,
          event_code: original.event_code,
          rule_version: original.rule_version,
          posting_mode: original.posting_mode,
          accounting_unit_id: original.accounting_unit_id,
          transaction_date: todayStr(),
          value_date: todayStr(),
          posting_date: postingDate,
          batch_status: 'POSTED',
          total_debit: fmt(totalDebit),
          total_credit: fmt(totalCredit),
          line_count: linesToReverse.length,
          narration: `Partial reversal of ${original.batch_ref} (lines ${lineFilter.join(',')}): ${reason}`,
          fund_id: original.fund_id,
          maker_id: userId,
        })
        .returning();

      for (const line of linesToReverse) {
        const reversedDrCr: 'DR' | 'CR' = line.dr_cr === 'DR' ? 'CR' : 'DR';
        await tx.insert(schema.glJournalLines).values({
          batch_id: reversalBatch.id,
          line_no: line.line_no,
          dr_cr: reversedDrCr,
          gl_head_id: line.gl_head_id,
          gl_access_code: line.gl_access_code,
          amount: line.amount,
          currency: line.currency,
          base_currency: line.base_currency,
          base_amount: line.base_amount,
          fund_id: line.fund_id,
          portfolio_id: line.portfolio_id,
          security_id: line.security_id,
          counterparty_id: line.counterparty_id,
          narration: `Partial reversal of line ${line.line_no}`,
        });

        // Update ledger balances
        const amt = toNum(line.base_amount);
        const debitDelta = reversedDrCr === 'DR' ? amt : 0;
        const creditDelta = reversedDrCr === 'CR' ? amt : 0;
        const netDelta = debitDelta - creditDelta;

        const [existingBalance] = await tx
          .select()
          .from(schema.glLedgerBalances)
          .where(
            and(
              eq(schema.glLedgerBalances.gl_head_id, line.gl_head_id),
              eq(schema.glLedgerBalances.accounting_unit_id, original.accounting_unit_id),
              eq(schema.glLedgerBalances.currency, line.currency),
              eq(schema.glLedgerBalances.balance_date, balanceDate),
            ),
          )
          .limit(1);

        if (existingBalance) {
          await tx
            .update(schema.glLedgerBalances)
            .set({
              debit_turnover: fmt(toNum(existingBalance.debit_turnover) + debitDelta),
              credit_turnover: fmt(toNum(existingBalance.credit_turnover) + creditDelta),
              closing_balance: fmt(toNum(existingBalance.closing_balance) + netDelta),
              last_posting_ref: reversalRef,
              updated_at: postingDate,
            })
            .where(eq(schema.glLedgerBalances.id, existingBalance.id));
        }
      }

      // Create reversal link
      await tx.insert(schema.glReversalLinks).values({
        original_batch_id: batchId,
        reversal_batch_id: reversalBatch.id,
        reversal_type: 'REVERSAL',
        reversal_reason: `Partial: ${reason}`,
        approved_by: userId,
        approved_at: postingDate,
      });

      return reversalBatch;
    });

    return {
      original_batch_id: batchId,
      reversal_batch_id: result.id,
      lines_reversed: linesToReverse.length,
    };
  },

  // =========================================================================
  // PORT-003: Transfer classification with gain/loss journal
  //
  // BR-017: HTM/HTC→AFS/HFT transfer recognises unrealised gain/loss on date of
  // reclassification. A balanced journal batch is posted:
  //   Gain scenario:  DR  AFS-MTM-ASSET   /  CR  AFS-MTM-GAIN
  //   Loss scenario:  DR  AFS-MTM-LOSS    /  CR  AFS-MTM-ASSET
  //   No P&L if reclassification is within the same measurement category
  //   (e.g. HFT→FVPL) — batch_id is null in that case.
  // =========================================================================

  async transferClassification(params: {
    portfolioId: number;
    securityId: number;
    fromClassification: string;
    toClassification: string;
    fairValue: number;
    carryingValue: number;
    currency?: string;
    businessDate: string;
    userId: number;
  }): Promise<{ gain_loss: number; batch_id: number | null }> {
    const gainLoss = params.fairValue - params.carryingValue;
    const currency = params.currency ?? 'PHP';
    const absAmount = Math.abs(gainLoss);

    // Audit trail first (always recorded regardless of journal posting)
    await db.insert(schema.glAuditLog).values({
      action: 'TRANSFER_CLASSIFICATION',
      object_type: 'PORTFOLIO_SECURITY',
      object_id: params.portfolioId,
      user_id: params.userId,
      old_values: {
        classification: params.fromClassification,
        carrying_value: params.carryingValue,
      } as Record<string, unknown>,
      new_values: {
        classification: params.toClassification,
        fair_value: params.fairValue,
        gain_loss: gainLoss,
      } as Record<string, unknown>,
    });

    // No journal needed when gain_loss is zero or reclassification stays within
    // the same measurement basis (both FVPL variants, both HTM/HTC variants).
    const sameBasis =
      ([params.fromClassification, params.toClassification].every((c) =>
        ['FVPL', 'FVTPL'].includes(c),
      ) ||
        [params.fromClassification, params.toClassification].every((c) =>
          ['HTM', 'HTC'].includes(c),
        ));

    if (absAmount === 0 || sameBasis) {
      return { gain_loss: gainLoss, batch_id: null };
    }

    // Post balanced gain/loss journal batch (PORT-003, BR-017)
    const batchRef = generateBatchRef();
    const fmtAmt = gainLoss.toFixed(2);
    const narration =
      `Reclassification ${params.fromClassification}→${params.toClassification} ` +
      `portfolio ${params.portfolioId} security ${params.securityId} ` +
      `fair=${params.fairValue.toFixed(2)} carrying=${params.carryingValue.toFixed(2)}`;

    const result = await db.transaction(async (tx: any) => {
      const [batch] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: batchRef,
          source_system: 'GL_RECLASSIFICATION',
          event_code: 'CLASSIFICATION_TRANSFER',
          posting_mode: 'ONLINE',
          transaction_date: params.businessDate,
          value_date: params.businessDate,
          batch_status: 'POSTED',
          total_debit: Math.abs(gainLoss).toFixed(2),
          total_credit: Math.abs(gainLoss).toFixed(2),
          line_count: 2,
          narration,
          posted_by: params.userId,
          posted_at: new Date(),
        })
        .returning();

      if (gainLoss > 0) {
        // Gain: DR AFS-MTM-ASSET (increase in asset carrying value)
        await tx.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: 1,
          dr_cr: 'DR',
          gl_access_code: 'AFS-MTM-ASSET',
          amount: fmtAmt,
          currency,
          base_currency: 'PHP',
          base_amount: fmtAmt,
          portfolio_id: params.portfolioId,
          security_id: params.securityId,
          narration: `Reclassification gain — asset side`,
        });
        // CR AFS-MTM-GAIN (P&L or OCI depending on classification)
        await tx.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: 2,
          dr_cr: 'CR',
          gl_access_code: 'AFS-MTM-GAIN',
          amount: fmtAmt,
          currency,
          base_currency: 'PHP',
          base_amount: fmtAmt,
          portfolio_id: params.portfolioId,
          security_id: params.securityId,
          narration: `Reclassification gain — income side`,
        });
      } else {
        // Loss: DR AFS-MTM-LOSS (P&L charge)
        await tx.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: 1,
          dr_cr: 'DR',
          gl_access_code: 'AFS-MTM-LOSS',
          amount: Math.abs(gainLoss).toFixed(2),
          currency,
          base_currency: 'PHP',
          base_amount: Math.abs(gainLoss).toFixed(2),
          portfolio_id: params.portfolioId,
          security_id: params.securityId,
          narration: `Reclassification loss — P&L charge`,
        });
        // CR AFS-MTM-ASSET (reduce carrying value)
        await tx.insert(schema.glJournalLines).values({
          batch_id: batch.id,
          line_no: 2,
          dr_cr: 'CR',
          gl_access_code: 'AFS-MTM-ASSET',
          amount: Math.abs(gainLoss).toFixed(2),
          currency,
          base_currency: 'PHP',
          base_amount: Math.abs(gainLoss).toFixed(2),
          portfolio_id: params.portfolioId,
          security_id: params.securityId,
          narration: `Reclassification loss — asset reduction`,
        });
      }

      return batch;
    });

    return { gain_loss: gainLoss, batch_id: result.id };
  },

  // =========================================================================
  // POST-CA-LOSS: Post claim loss journal entry
  // =========================================================================
  /**
   * Post a CA-Loss journal entry for a settled claim.
   * Debits the CA-Loss P&L account and credits Cash/Receivable.
   *
   * @param claimId  - The claim identifier (used as source reference)
   * @param amount   - The loss amount to post
   * @param currency - The currency code (e.g. 'PHP')
   * @returns The posted journal batch with batch_id and batch_ref
   */
  async postClaimLoss(
    claimId: string,
    amount: number,
    currency: string,
  ): Promise<{ batch_id: number; batch_ref: string; line_count: number }> {
    const batchRef = generateBatchRef();
    const postingDate = todayStr();
    const absAmount = Math.abs(amount);
    const formattedAmount = fmt(absAmount);

    const result = await db.transaction(async (tx: any) => {
      // Create the journal batch
      const [batch] = await tx
        .insert(schema.glJournalBatches)
        .values({
          batch_ref: batchRef,
          source_system: 'CLAIMS',
          event_code: 'CA_LOSS',
          posting_mode: 'ONLINE',
          transaction_date: postingDate,
          value_date: postingDate,
          batch_status: 'POSTED',
          total_debit: formattedAmount,
          total_credit: formattedAmount,
          line_count: 2,
          narration: `Claim loss posting for claim ${claimId}`,
        })
        .returning();

      // Line 1: Debit CA-Loss P&L account
      await tx.insert(schema.glJournalLines).values({
        batch_id: batch.id,
        line_no: 1,
        dr_cr: 'DR',
        gl_access_code: 'CA-LOSS-PNL',
        amount: formattedAmount,
        currency: currency,
        base_currency: 'PHP',
        base_amount: formattedAmount,
        narration: `CA-Loss debit — claim ${claimId}`,
      });

      // Line 2: Credit Cash/Receivable account
      await tx.insert(schema.glJournalLines).values({
        batch_id: batch.id,
        line_no: 2,
        dr_cr: 'CR',
        gl_access_code: 'CASH-RECEIVABLE',
        amount: formattedAmount,
        currency: currency,
        base_currency: 'PHP',
        base_amount: formattedAmount,
        narration: `Cash/Receivable credit — claim ${claimId}`,
      });

      return batch;
    });

    return {
      batch_id: result.id,
      batch_ref: result.batch_ref,
      line_count: 2,
    };
  },
};
