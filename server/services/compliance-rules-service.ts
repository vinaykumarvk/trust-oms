/**
 * Compliance Rules Service (Phase 4A)
 *
 * Rules engine providing CRUD for compliance rules and evaluation
 * logic for orders and positions against active rule sets.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, desc, and, sql, isNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleFilters {
  ruleType?: string;
  entityType?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

interface RuleCreateData {
  ruleType: string;
  entityType: string;
  condition: Record<string, any>;
  action: string;
  severity: string;
}

interface RuleUpdateData {
  ruleType?: string;
  entityType?: string;
  condition?: Record<string, any>;
  action?: string;
  severity?: string;
  isActive?: boolean;
}

interface EvaluationResult {
  ruleId: number;
  ruleName: string;
  passed: boolean;
  breachDescription: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const complianceRulesService = {
  // -------------------------------------------------------------------------
  // List rules (paginated, filterable)
  // -------------------------------------------------------------------------
  async getRules(filters: RuleFilters) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.ruleType) {
      conditions.push(eq(schema.complianceRules.rule_type, filters.ruleType));
    }

    if (filters.entityType) {
      conditions.push(
        eq(schema.complianceRules.entity_type, filters.entityType),
      );
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.complianceRules.is_active, filters.isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.complianceRules)
      .where(where)
      .orderBy(desc(schema.complianceRules.created_at))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.complianceRules)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page, pageSize };
  },

  // -------------------------------------------------------------------------
  // Get single rule
  // -------------------------------------------------------------------------
  async getRule(id: number) {
    const [rule] = await db
      .select()
      .from(schema.complianceRules)
      .where(eq(schema.complianceRules.id, id))
      .limit(1);

    if (!rule) {
      throw new Error(`Compliance rule not found: ${id}`);
    }

    return rule;
  },

  // -------------------------------------------------------------------------
  // Create a new rule
  // -------------------------------------------------------------------------
  async createRule(data: RuleCreateData) {
    const [rule] = await db
      .insert(schema.complianceRules)
      .values({
        rule_type: data.ruleType,
        entity_type: data.entityType,
        condition: data.condition,
        action: data.action,
        severity: data.severity,
        is_active: true,
      })
      .returning();

    return rule;
  },

  // -------------------------------------------------------------------------
  // Update a rule (partial)
  // -------------------------------------------------------------------------
  async updateRule(id: number, changes: RuleUpdateData) {
    const [existing] = await db
      .select()
      .from(schema.complianceRules)
      .where(eq(schema.complianceRules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Compliance rule not found: ${id}`);
    }

    const [updated] = await db
      .update(schema.complianceRules)
      .set({
        rule_type: changes.ruleType ?? existing.rule_type,
        entity_type: changes.entityType ?? existing.entity_type,
        condition: changes.condition ?? existing.condition,
        action: changes.action ?? existing.action,
        severity: changes.severity ?? existing.severity,
        is_active: changes.isActive ?? existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(schema.complianceRules.id, id))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Soft-delete a rule (set is_active = false)
  // -------------------------------------------------------------------------
  async deleteRule(id: number) {
    const [existing] = await db
      .select()
      .from(schema.complianceRules)
      .where(eq(schema.complianceRules.id, id))
      .limit(1);

    if (!existing) {
      throw new Error(`Compliance rule not found: ${id}`);
    }

    const [updated] = await db
      .update(schema.complianceRules)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(schema.complianceRules.id, id))
      .returning();

    return updated;
  },

  // -------------------------------------------------------------------------
  // Evaluate an order against all active rules
  // -------------------------------------------------------------------------
  async evaluateOrder(orderId: string): Promise<EvaluationResult[]> {
    // Load the order
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.order_id, orderId))
      .limit(1);

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Load all active rules
    const rules = await db
      .select()
      .from(schema.complianceRules)
      .where(eq(schema.complianceRules.is_active, true));

    const results: EvaluationResult[] = [];

    for (const rule of rules) {
      const condition = (rule.condition ?? {}) as Record<string, any>;
      const ruleName = `${rule.rule_type ?? 'UNKNOWN'} — ${rule.entity_type ?? 'ALL'}`;
      let passed = true;
      let breachDescription: string | null = null;

      // --- RESTRICTED_LIST check ---
      if (rule.rule_type === 'RESTRICTED_LIST') {
        const restrictedSecurities: number[] =
          condition.securities ?? condition.security_ids ?? [];
        if (
          order.security_id &&
          restrictedSecurities.includes(order.security_id)
        ) {
          passed = false;
          breachDescription = `Order security ${order.security_id} is on the restricted list (rule ${rule.id})`;
        }
      }

      // --- POLICY_LIMIT check ---
      if (rule.rule_type === 'POLICY_LIMIT') {
        const maxAllocation = condition.maxAllocation as number | undefined;
        if (maxAllocation !== undefined && order.quantity) {
          const orderQty = parseFloat(order.quantity);
          if (orderQty > maxAllocation) {
            passed = false;
            breachDescription = `Order quantity ${orderQty} exceeds policy limit of ${maxAllocation} (rule ${rule.id})`;
          }
        }
      }

      // --- SUITABILITY check ---
      if (rule.rule_type === 'SUITABILITY') {
        // Check if order has a suitability check result and it failed
        const suitResult = order.suitability_check_result as Record<
          string,
          any
        > | null;
        if (suitResult && suitResult.suitable === false) {
          passed = false;
          breachDescription = `Order failed suitability check: ${suitResult.reason ?? 'unsuitable investment'} (rule ${rule.id})`;
        }
      }

      // --- IPS (Investment Policy Statement) check ---
      if (rule.rule_type === 'IPS') {
        const allowedAssetClasses: string[] =
          condition.allowedAssetClasses ?? [];
        if (allowedAssetClasses.length > 0 && order.security_id) {
          // Look up the security's asset class
          const [security] = await db
            .select({ asset_class: schema.securities.asset_class })
            .from(schema.securities)
            .where(eq(schema.securities.id, order.security_id))
            .limit(1);

          if (
            security?.asset_class &&
            !allowedAssetClasses.includes(security.asset_class)
          ) {
            passed = false;
            breachDescription = `Security asset class '${security.asset_class}' not in IPS allowed list [${allowedAssetClasses.join(', ')}] (rule ${rule.id})`;
          }
        }
      }

      results.push({
        ruleId: rule.id,
        ruleName,
        passed,
        breachDescription,
      });
    }

    return results;
  },

  // -------------------------------------------------------------------------
  // Evaluate positions for a portfolio (concentration / sector limits)
  // -------------------------------------------------------------------------
  async evaluatePosition(portfolioId: string): Promise<EvaluationResult[]> {
    // Load portfolio
    const [portfolio] = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.portfolio_id, portfolioId))
      .limit(1);

    if (!portfolio) {
      throw new Error(`Portfolio not found: ${portfolioId}`);
    }

    const aum = parseFloat(portfolio.aum ?? '0');

    // Load positions with security info
    const positions = await db
      .select({
        position_id: schema.positions.id,
        security_id: schema.positions.security_id,
        quantity: schema.positions.quantity,
        market_value: schema.positions.market_value,
        security_name: schema.securities.name,
        asset_class: schema.securities.asset_class,
        sector: schema.securities.sector,
      })
      .from(schema.positions)
      .leftJoin(
        schema.securities,
        eq(schema.positions.security_id, schema.securities.id),
      )
      .where(eq(schema.positions.portfolio_id, portfolioId));

    // Load all active rules relevant to position evaluation
    const rules = await db
      .select()
      .from(schema.complianceRules)
      .where(eq(schema.complianceRules.is_active, true));

    const results: EvaluationResult[] = [];

    for (const rule of rules) {
      const condition = (rule.condition ?? {}) as Record<string, any>;
      const ruleName = `${rule.rule_type ?? 'UNKNOWN'} — ${rule.entity_type ?? 'ALL'}`;
      let passed = true;
      let breachDescription: string | null = null;

      // --- POLICY_LIMIT: concentration check ---
      if (
        rule.rule_type === 'POLICY_LIMIT' &&
        condition.maxConcentrationPct !== undefined
      ) {
        const maxPct = condition.maxConcentrationPct as number;
        for (const pos of positions) {
          const mv = parseFloat(pos.market_value ?? '0');
          if (aum > 0) {
            const concentrationPct = (mv / aum) * 100;
            if (concentrationPct > maxPct) {
              passed = false;
              breachDescription = `Position in ${pos.security_name ?? `security ${pos.security_id}`} has ${concentrationPct.toFixed(2)}% concentration, exceeds ${maxPct}% limit (rule ${rule.id})`;
              break;
            }
          }
        }
      }

      // --- POLICY_LIMIT: sector limit check ---
      if (
        rule.rule_type === 'POLICY_LIMIT' &&
        condition.maxSectorPct !== undefined
      ) {
        const maxSectorPct = condition.maxSectorPct as number;
        // Aggregate by sector
        const sectorMap = new Map<string, number>();
        for (const pos of positions) {
          const sector = pos.sector ?? 'UNKNOWN';
          const mv = parseFloat(pos.market_value ?? '0');
          sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + mv);
        }

        for (const [sector, sectorMv] of sectorMap) {
          if (aum > 0) {
            const sectorPct = (sectorMv / aum) * 100;
            if (sectorPct > maxSectorPct) {
              passed = false;
              breachDescription = `Sector '${sector}' has ${sectorPct.toFixed(2)}% allocation, exceeds ${maxSectorPct}% limit (rule ${rule.id})`;
              break;
            }
          }
        }
      }

      // --- RESTRICTED_LIST: check if any held security is restricted ---
      if (rule.rule_type === 'RESTRICTED_LIST') {
        const restrictedSecurities: number[] =
          condition.securities ?? condition.security_ids ?? [];
        for (const pos of positions) {
          if (
            pos.security_id &&
            restrictedSecurities.includes(pos.security_id)
          ) {
            passed = false;
            breachDescription = `Portfolio holds restricted security ${pos.security_name ?? pos.security_id} (rule ${rule.id})`;
            break;
          }
        }
      }

      results.push({
        ruleId: rule.id,
        ruleName,
        passed,
        breachDescription,
      });
    }

    return results;
  },
};
