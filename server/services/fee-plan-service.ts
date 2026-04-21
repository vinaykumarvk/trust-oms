/**
 * Fee Plan Service (TrustFees Pro -- Phase 5)
 *
 * Central service managing Fee Plan entities with full lifecycle:
 *   DRAFT -> PENDING_APPROVAL -> ACTIVE -> EXPIRED / SUSPENDED / SUPERSEDED
 *
 * A Fee Plan references:
 *   - PricingDefinition (pricing tiers / rates)
 *   - EligibilityExpression (who qualifies)
 *   - AccrualSchedule (when/how fees accrue)
 *   - Jurisdiction (PH/SG/ID)
 *   - FeePlanTemplate (optional -- pre-fills defaults)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, ilike, or } from 'drizzle-orm';
import { feePlanTemplateService } from './fee-plan-template-service';
import { pricingDefinitionService } from './pricing-definition-service';

export const feePlanService = {
  /**
   * Create a new Fee Plan (starts as DRAFT).
   * If template_id is provided, merges template default_payload.
   * Validates business rules before insert.
   */
  async create(data: {
    fee_plan_code: string;
    fee_plan_name: string;
    description?: string;
    charge_basis: string;
    fee_type: string;
    pricing_definition_id?: number;
    pricing_binding_mode?: string;
    eligibility_expression_id?: number;
    accrual_schedule_id?: number;
    jurisdiction_id?: number;
    source_party: string;
    target_party: string;
    comparison_basis: string;
    value_basis: string;
    event_type?: string;
    min_charge_amount?: string;
    max_charge_amount?: string;
    lower_threshold_pct?: string;
    upper_threshold_pct?: string;
    rate_type?: string;
    aum_basis_include_uitf?: boolean;
    aum_basis_include_3p_funds?: boolean;
    market_value_includes_accruals_override?: boolean;
    effective_date: string;
    expiry_date?: string;
    template_id?: number;
    created_by?: string;
  }) {
    // If template_id provided, merge template defaults first
    let mergedData = { ...data };
    if (data.template_id) {
      const templatePayload = await feePlanTemplateService.instantiate(data.template_id);
      // Template defaults are overridden by explicit data
      const { template_id: _tid, template_code: _tc, template_name: _tn, category: _cat, ...templateFields } = templatePayload;
      mergedData = { ...templateFields, ...data } as typeof data;
    }

    // --- Validation ---
    // charge_basis=PERIOD requires accrual_schedule_id
    if (mergedData.charge_basis === 'PERIOD' && !mergedData.accrual_schedule_id) {
      throw new Error('charge_basis PERIOD requires an accrual_schedule_id');
    }

    // charge_basis=EVENT requires event_type
    if (mergedData.charge_basis === 'EVENT' && !mergedData.event_type) {
      throw new Error('charge_basis EVENT requires an event_type');
    }

    // jurisdiction_id must reference an active jurisdiction
    if (mergedData.jurisdiction_id) {
      const [jur] = await db
        .select()
        .from(schema.jurisdictions)
        .where(eq(schema.jurisdictions.id, mergedData.jurisdiction_id))
        .limit(1);
      if (!jur) {
        throw new Error(`Jurisdiction not found: ${mergedData.jurisdiction_id}`);
      }
      if (!jur.is_active) {
        throw new Error(`Jurisdiction ${jur.code} is inactive`);
      }
    }

    // pricing_binding_mode=STRICT captures pricing_binding_version from the referenced PricingDefinition
    let pricingBindingVersion: number | null = null;
    if (
      mergedData.pricing_definition_id &&
      (mergedData.pricing_binding_mode ?? 'STRICT') === 'STRICT'
    ) {
      const pricingDef = await pricingDefinitionService.getById(mergedData.pricing_definition_id);
      pricingBindingVersion = pricingDef.pricing_version;
    }

    const [record] = await db
      .insert(schema.feePlans)
      .values({
        fee_plan_code: mergedData.fee_plan_code,
        fee_plan_name: mergedData.fee_plan_name,
        description: mergedData.description ?? null,
        charge_basis: mergedData.charge_basis as any,
        fee_type: mergedData.fee_type as any,
        pricing_definition_id: mergedData.pricing_definition_id ?? null,
        pricing_binding_mode: (mergedData.pricing_binding_mode ?? 'STRICT') as any,
        pricing_binding_version: pricingBindingVersion,
        eligibility_expression_id: mergedData.eligibility_expression_id ?? null,
        accrual_schedule_id: mergedData.accrual_schedule_id ?? null,
        jurisdiction_id: mergedData.jurisdiction_id ?? null,
        source_party: mergedData.source_party as any,
        target_party: mergedData.target_party as any,
        comparison_basis: mergedData.comparison_basis as any,
        value_basis: mergedData.value_basis as any,
        event_type: mergedData.event_type ? (mergedData.event_type as any) : null,
        min_charge_amount: mergedData.min_charge_amount ?? '0',
        max_charge_amount: mergedData.max_charge_amount ?? null,
        lower_threshold_pct: mergedData.lower_threshold_pct ?? '0.050000',
        upper_threshold_pct: mergedData.upper_threshold_pct ?? '0.400000',
        rate_type: (mergedData.rate_type ?? 'FLAT') as any,
        aum_basis_include_uitf: mergedData.aum_basis_include_uitf ?? false,
        aum_basis_include_3p_funds: mergedData.aum_basis_include_3p_funds ?? false,
        market_value_includes_accruals_override: mergedData.market_value_includes_accruals_override ?? null,
        effective_date: mergedData.effective_date,
        expiry_date: mergedData.expiry_date ?? null,
        plan_status: 'DRAFT',
        template_id: mergedData.template_id ?? null,
        created_by: mergedData.created_by ?? null,
        updated_by: mergedData.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** Update a DRAFT fee plan */
  async update(
    id: number,
    data: Record<string, unknown>,
  ) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'DRAFT') {
      throw new Error(
        `Cannot edit fee plan in ${current.plan_status} status. Only DRAFT plans can be edited.`,
      );
    }

    // Build update payload
    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    const allowedFields = [
      'fee_plan_name', 'description', 'charge_basis', 'fee_type',
      'pricing_definition_id', 'pricing_binding_mode', 'eligibility_expression_id',
      'accrual_schedule_id', 'jurisdiction_id', 'source_party', 'target_party',
      'comparison_basis', 'value_basis', 'event_type',
      'min_charge_amount', 'max_charge_amount',
      'lower_threshold_pct', 'upper_threshold_pct',
      'rate_type', 'aum_basis_include_uitf', 'aum_basis_include_3p_funds',
      'market_value_includes_accruals_override', 'effective_date', 'expiry_date',
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        setValues[field] = data[field];
      }
    }

    // Re-capture pricing_binding_version if pricing_definition_id or pricing_binding_mode changed
    const newPricingDefId = (data.pricing_definition_id as number) ?? current.pricing_definition_id;
    const newBindingMode = (data.pricing_binding_mode as string) ?? current.pricing_binding_mode;
    if (newPricingDefId && newBindingMode === 'STRICT') {
      const pricingDef = await pricingDefinitionService.getById(newPricingDefId);
      setValues.pricing_binding_version = pricingDef.pricing_version;
    } else if (newBindingMode === 'LATEST_APPROVED') {
      setValues.pricing_binding_version = null;
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set(setValues)
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /** List fee plans with filters and pagination */
  async getAll(filters?: {
    plan_status?: string;
    fee_type?: string;
    jurisdiction_id?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.plan_status) {
      conditions.push(
        eq(schema.feePlans.plan_status, filters.plan_status as any),
      );
    }

    if (filters?.fee_type) {
      conditions.push(
        eq(schema.feePlans.fee_type, filters.fee_type as any),
      );
    }

    if (filters?.jurisdiction_id) {
      conditions.push(
        eq(schema.feePlans.jurisdiction_id, filters.jurisdiction_id),
      );
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(schema.feePlans.fee_plan_code, `%${filters.search}%`),
          ilike(schema.feePlans.fee_plan_name, `%${filters.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.feePlans)
      .where(where)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(schema.feePlans.updated_at));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.feePlans)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  /** Get a single fee plan by ID with resolved reference names */
  async getById(id: number) {
    const [record] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    // Resolve reference names
    let pricing_definition_name: string | null = null;
    let pricing_type: string | null = null;
    let pricing_tiers: unknown = null;
    if (record.pricing_definition_id) {
      try {
        const pd = await pricingDefinitionService.getById(record.pricing_definition_id);
        pricing_definition_name = pd.pricing_name;
        pricing_type = pd.pricing_type;
        pricing_tiers = pd.pricing_tiers;
      } catch {
        pricing_definition_name = '(deleted)';
      }
    }

    let eligibility_expression_name: string | null = null;
    if (record.eligibility_expression_id) {
      const [ee] = await db
        .select({ name: schema.eligibilityExpressions.eligibility_name })
        .from(schema.eligibilityExpressions)
        .where(eq(schema.eligibilityExpressions.id, record.eligibility_expression_id))
        .limit(1);
      eligibility_expression_name = ee?.name ?? '(deleted)';
    }

    let accrual_schedule_name: string | null = null;
    if (record.accrual_schedule_id) {
      const [as_] = await db
        .select({ name: schema.accrualSchedules.schedule_name })
        .from(schema.accrualSchedules)
        .where(eq(schema.accrualSchedules.id, record.accrual_schedule_id))
        .limit(1);
      accrual_schedule_name = as_?.name ?? '(deleted)';
    }

    let template_name: string | null = null;
    if (record.template_id) {
      const [tmpl] = await db
        .select({ name: schema.feePlanTemplates.template_name })
        .from(schema.feePlanTemplates)
        .where(eq(schema.feePlanTemplates.id, record.template_id))
        .limit(1);
      template_name = tmpl?.name ?? '(deleted)';
    }

    let jurisdiction_name: string | null = null;
    let jurisdiction_code: string | null = null;
    if (record.jurisdiction_id) {
      const [jur] = await db
        .select({ name: schema.jurisdictions.name, code: schema.jurisdictions.code })
        .from(schema.jurisdictions)
        .where(eq(schema.jurisdictions.id, record.jurisdiction_id))
        .limit(1);
      jurisdiction_name = jur?.name ?? '(deleted)';
      jurisdiction_code = jur?.code ?? null;
    }

    return {
      ...record,
      pricing_definition_name,
      pricing_type,
      pricing_tiers,
      eligibility_expression_name,
      accrual_schedule_name,
      template_name,
      jurisdiction_name,
      jurisdiction_code,
    };
  },

  /** Submit a DRAFT plan for approval (DRAFT -> PENDING_APPROVAL) */
  async submit(id: number) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'DRAFT') {
      throw new Error(
        `Cannot submit: fee plan is in ${current.plan_status} status. Only DRAFT plans can be submitted.`,
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        plan_status: 'PENDING_APPROVAL',
        updated_at: new Date(),
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /** Approve a PENDING_APPROVAL plan (PENDING_APPROVAL -> ACTIVE). SoD enforced. */
  async approve(id: number, approverId: string) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot approve: fee plan is in ${current.plan_status} status. Only PENDING_APPROVAL plans can be approved.`,
      );
    }

    // Segregation of Duties: approver must not be the creator
    if (current.created_by && approverId === current.created_by) {
      throw new Error(
        'Segregation of Duties violation: approver cannot be the same person who created the fee plan.',
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        plan_status: 'ACTIVE',
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /** Reject a PENDING_APPROVAL plan back to DRAFT */
  async reject(id: number, approverId: string, comment: string) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'PENDING_APPROVAL') {
      throw new Error(
        `Cannot reject: fee plan is in ${current.plan_status} status. Only PENDING_APPROVAL plans can be rejected.`,
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        plan_status: 'DRAFT',
        updated_at: new Date(),
        updated_by: approverId,
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return { ...updated, rejection_comment: comment };
  },

  /** Suspend an ACTIVE plan (ACTIVE -> SUSPENDED) */
  async suspend(id: number) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'ACTIVE') {
      throw new Error(
        `Cannot suspend: fee plan is in ${current.plan_status} status. Only ACTIVE plans can be suspended.`,
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        plan_status: 'SUSPENDED',
        updated_at: new Date(),
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /** Supersede an ACTIVE plan (ACTIVE -> SUPERSEDED). Creates a new DRAFT clone. */
  async supersede(id: number) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'ACTIVE') {
      throw new Error(
        `Cannot supersede: fee plan is in ${current.plan_status} status. Only ACTIVE plans can be superseded.`,
      );
    }

    // Mark old plan as SUPERSEDED
    await db
      .update(schema.feePlans)
      .set({
        plan_status: 'SUPERSEDED',
        updated_at: new Date(),
      })
      .where(eq(schema.feePlans.id, id));

    // Create a new DRAFT clone with a new code suffix
    const newCode = `${current.fee_plan_code}-V${Date.now().toString(36).toUpperCase()}`;
    const [cloned] = await db
      .insert(schema.feePlans)
      .values({
        fee_plan_code: newCode,
        fee_plan_name: `${current.fee_plan_name} (superseded copy)`,
        description: current.description,
        charge_basis: current.charge_basis,
        fee_type: current.fee_type,
        pricing_definition_id: current.pricing_definition_id,
        pricing_binding_mode: current.pricing_binding_mode,
        pricing_binding_version: current.pricing_binding_version,
        eligibility_expression_id: current.eligibility_expression_id,
        accrual_schedule_id: current.accrual_schedule_id,
        jurisdiction_id: current.jurisdiction_id,
        source_party: current.source_party,
        target_party: current.target_party,
        comparison_basis: current.comparison_basis,
        value_basis: current.value_basis,
        event_type: current.event_type,
        min_charge_amount: current.min_charge_amount,
        max_charge_amount: current.max_charge_amount,
        lower_threshold_pct: current.lower_threshold_pct,
        upper_threshold_pct: current.upper_threshold_pct,
        rate_type: current.rate_type,
        modification_allowed: current.modification_allowed,
        aum_basis_include_uitf: current.aum_basis_include_uitf,
        aum_basis_include_3p_funds: current.aum_basis_include_3p_funds,
        market_value_includes_accruals_override: current.market_value_includes_accruals_override,
        effective_date: current.effective_date,
        expiry_date: current.expiry_date,
        plan_status: 'DRAFT',
        template_id: current.template_id,
        created_by: current.created_by,
        updated_by: current.updated_by,
      })
      .returning();

    return { superseded: current, newDraft: cloned };
  },

  /** Expire an ACTIVE plan (ACTIVE -> EXPIRED) */
  async expire(id: number) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.plan_status !== 'ACTIVE') {
      throw new Error(
        `Cannot expire: fee plan is in ${current.plan_status} status. Only ACTIVE plans can be expired.`,
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        plan_status: 'EXPIRED',
        updated_at: new Date(),
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /** Re-bind pricing version for a STRICT-bound plan */
  async rebindPricing(id: number, newPricingVersionId: number) {
    const [current] = await db
      .select()
      .from(schema.feePlans)
      .where(eq(schema.feePlans.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fee plan not found: ${id}`);
    }

    if (current.pricing_binding_mode !== 'STRICT') {
      throw new Error('Re-bind is only applicable to STRICT binding mode plans');
    }

    if (!current.pricing_definition_id) {
      throw new Error('Fee plan has no pricing definition assigned');
    }

    // Verify the new pricing version exists on the referenced pricing def
    const pricingDef = await pricingDefinitionService.getById(current.pricing_definition_id);
    if (newPricingVersionId > pricingDef.pricing_version) {
      throw new Error(
        `Requested pricing version ${newPricingVersionId} exceeds current version ${pricingDef.pricing_version}`,
      );
    }

    const [updated] = await db
      .update(schema.feePlans)
      .set({
        pricing_binding_version: newPricingVersionId,
        updated_at: new Date(),
      })
      .where(eq(schema.feePlans.id, id))
      .returning();

    return updated;
  },

  /**
   * Live calculation preview.
   * Takes feePlanId and context { aum_value, transaction_amount }.
   * Uses the pricing definition tiers to compute the fee.
   */
  async computePreview(
    feePlanId: number,
    context: { aum_value?: number; transaction_amount?: number },
  ) {
    const plan = await feePlanService.getById(feePlanId);

    if (!plan.pricing_definition_id) {
      throw new Error('Fee plan has no pricing definition assigned');
    }

    const pricingDef = await pricingDefinitionService.getById(plan.pricing_definition_id);
    const tiers = (pricingDef.pricing_tiers as any[]) ?? [];
    const pricingType = pricingDef.pricing_type;

    // Determine the base value based on charge basis
    const baseValue =
      plan.charge_basis === 'EVENT'
        ? (context.transaction_amount ?? 0)
        : (context.aum_value ?? 0);

    let computedFee = 0;
    const breakdown: {
      tier: number;
      from: number;
      to: number;
      rate_or_amount: number;
      computed: number;
    }[] = [];

    // Evaluate eligibility if an expression is set
    let eligibilityResult: boolean | null = null;
    if (plan.eligibility_expression_id) {
      // For preview purposes, we assume eligible
      eligibilityResult = true;
    }

    switch (pricingType) {
      case 'FIXED_AMOUNT': {
        const amt = tiers[0]?.amount ?? 0;
        computedFee = amt;
        breakdown.push({
          tier: 1,
          from: 0,
          to: baseValue,
          rate_or_amount: amt,
          computed: amt,
        });
        break;
      }

      case 'FIXED_RATE': {
        const rate = tiers[0]?.rate ?? 0;
        computedFee = baseValue * (rate / 100);
        breakdown.push({
          tier: 1,
          from: 0,
          to: baseValue,
          rate_or_amount: rate,
          computed: computedFee,
        });
        break;
      }

      case 'SLAB_CUMULATIVE_RATE': {
        // Apply each tier's rate to the portion of base value within that tier's range
        let remaining = baseValue;
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          const from = tier.from ?? 0;
          const to = tier.to ?? Infinity;
          const rate = tier.rate ?? 0;

          if (remaining <= 0) break;

          const tierWidth = to === 0 || to === Infinity ? remaining : Math.min(to - from, remaining);
          const tierFee = tierWidth * (rate / 100);

          breakdown.push({
            tier: i + 1,
            from,
            to: to === Infinity || to === 0 ? baseValue : to,
            rate_or_amount: rate,
            computed: tierFee,
          });

          computedFee += tierFee;
          remaining -= tierWidth;
        }
        break;
      }

      case 'SLAB_CUMULATIVE_AMOUNT': {
        let remaining = baseValue;
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          const from = tier.from ?? 0;
          const to = tier.to ?? Infinity;
          const amount = tier.amount ?? 0;

          if (baseValue >= from) {
            breakdown.push({
              tier: i + 1,
              from,
              to: to === Infinity || to === 0 ? baseValue : to,
              rate_or_amount: amount,
              computed: amount,
            });
            computedFee += amount;
          }
          remaining -= (to - from);
          if (remaining <= 0) break;
        }
        break;
      }

      case 'SLAB_INCREMENTAL_RATE': {
        // Find the applicable tier (the one where baseValue falls) and apply that single rate to the entire baseValue
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          const from = tier.from ?? 0;
          const to = tier.to ?? Infinity;
          const rate = tier.rate ?? 0;

          if (baseValue >= from && (baseValue < to || to === 0 || to === Infinity)) {
            computedFee = baseValue * (rate / 100);
            breakdown.push({
              tier: i + 1,
              from,
              to: to === Infinity || to === 0 ? baseValue : to,
              rate_or_amount: rate,
              computed: computedFee,
            });
            break;
          }
        }
        break;
      }

      case 'SLAB_INCREMENTAL_AMOUNT': {
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          const from = tier.from ?? 0;
          const to = tier.to ?? Infinity;
          const amount = tier.amount ?? 0;

          if (baseValue >= from && (baseValue < to || to === 0 || to === Infinity)) {
            computedFee = amount;
            breakdown.push({
              tier: i + 1,
              from,
              to: to === Infinity || to === 0 ? baseValue : to,
              rate_or_amount: amount,
              computed: amount,
            });
            break;
          }
        }
        break;
      }

      case 'STEP_FUNCTION': {
        const stepWindows = (pricingDef.step_windows as any[]) ?? [];
        // Step function uses step_windows, not tiers
        for (let i = 0; i < stepWindows.length; i++) {
          const step = stepWindows[i];
          computedFee = step.amount ?? 0;
          breakdown.push({
            tier: i + 1,
            from: step.from_month ?? 0,
            to: step.to_month ?? 0,
            rate_or_amount: step.amount ?? 0,
            computed: step.amount ?? 0,
          });
        }
        // Use the last applicable step window amount
        if (stepWindows.length > 0) {
          computedFee = stepWindows[stepWindows.length - 1].amount ?? 0;
        }
        break;
      }

      default: {
        throw new Error(`Unsupported pricing type: ${pricingType}`);
      }
    }

    // Apply min/max charge amount constraints
    const minCharge = parseFloat(plan.min_charge_amount ?? '0');
    const maxCharge = plan.max_charge_amount ? parseFloat(plan.max_charge_amount) : null;

    if (computedFee < minCharge) {
      computedFee = minCharge;
    }
    if (maxCharge !== null && computedFee > maxCharge) {
      computedFee = maxCharge;
    }

    return {
      computed_fee: Math.round(computedFee * 10000) / 10000,
      breakdown,
      eligibility_result: eligibilityResult,
      pricing_type: pricingType,
    };
  },

  /** List all ACTIVE plans referencing a given pricing definition */
  async getFeePlansForPricingVersion(pricingId: number) {
    const data = await db
      .select()
      .from(schema.feePlans)
      .where(
        and(
          eq(schema.feePlans.pricing_definition_id, pricingId),
          eq(schema.feePlans.plan_status, 'ACTIVE'),
        ),
      )
      .orderBy(desc(schema.feePlans.updated_at));

    return data;
  },
};
