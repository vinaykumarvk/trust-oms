/**
 * GL Master Data Service (Enterprise GL)
 *
 * Centralised master-data CRUD for:
 *   - GL Categories, Hierarchy, Heads (Chart of Accounts)
 *   - GL Access Codes, Accounting Units
 *   - Fund Master, FX Rates
 *   - Financial Year / Period
 *   - FRPTI & FS Mappings, Revaluation Parameters
 *   - GL Counterparty & Portfolio Master
 *
 * Business-rule references (BR-xxx) map to the Enterprise GL BRD.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql, like, or, isNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helper: standard paginated list wrapper
// ---------------------------------------------------------------------------
function paginationDefaults(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 25, 1), 200);
  return { page: p, limit: l, offset: (p - 1) * l };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const glMasterService = {
  // =========================================================================
  // GL Category
  // =========================================================================

  /** 1. Create a GL category */
  async createGlCategory(data: {
    code: string;
    name: string;
    category_type: string;
    concise_name?: string;
    is_bank_gl?: boolean;
    is_nostro?: boolean;
    is_vostro?: boolean;
    description?: string;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.glCategories.id })
      .from(schema.glCategories)
      .where(eq(schema.glCategories.code, data.code))
      .limit(1);

    if (existing) {
      throw new Error(`GL category code '${data.code}' already exists`);
    }

    const [record] = await db
      .insert(schema.glCategories)
      .values({
        code: data.code,
        name: data.name,
        category_type: data.category_type,
        concise_name: data.concise_name ?? null,
        is_bank_gl: data.is_bank_gl ?? false,
        is_nostro: data.is_nostro ?? false,
        is_vostro: data.is_vostro ?? false,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 2. Update a GL category (code is immutable) */
  async updateGlCategory(id: number, data: Record<string, unknown>) {
    const [current] = await db
      .select()
      .from(schema.glCategories)
      .where(eq(schema.glCategories.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`GL category not found: ${id}`);
    }

    if (data.code !== undefined && data.code !== current.code) {
      throw new Error('GL category code cannot be changed once created');
    }

    const allowedFields = [
      'name', 'concise_name', 'category_type',
      'is_bank_gl', 'is_nostro', 'is_vostro', 'description',
    ] as const;

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    for (const f of allowedFields) {
      if (data[f] !== undefined) {
        setValues[f] = data[f];
      }
    }

    const [updated] = await db
      .update(schema.glCategories)
      .set(setValues)
      .where(eq(schema.glCategories.id, id))
      .returning();

    return updated;
  },

  /** 3. List GL categories with optional search & pagination */
  async getGlCategories(search?: string, page?: number, limit?: number) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          like(schema.glCategories.code, `%${search}%`),
          like(schema.glCategories.name, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glCategories)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.glCategories.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glCategories)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },

  /** 4. Get a single GL category by ID */
  async getGlCategory(id: number) {
    const [record] = await db
      .select()
      .from(schema.glCategories)
      .where(eq(schema.glCategories.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`GL category not found: ${id}`);
    }
    return record;
  },

  // =========================================================================
  // GL Hierarchy
  // =========================================================================

  /** 5. Create a hierarchy node */
  async createGlHierarchy(data: {
    code: string;
    name: string;
    parent_hierarchy_id?: number;
    level?: number;
    sort_order?: number;
    description?: string;
    created_by?: string;
  }) {
    // Validate parent exists if provided
    if (data.parent_hierarchy_id) {
      const [parent] = await db
        .select({ id: schema.glHierarchy.id, level: schema.glHierarchy.level })
        .from(schema.glHierarchy)
        .where(eq(schema.glHierarchy.id, data.parent_hierarchy_id))
        .limit(1);

      if (!parent) {
        throw new Error(`Parent hierarchy node not found: ${data.parent_hierarchy_id}`);
      }

      // Auto-derive level from parent if not explicitly given
      if (data.level === undefined) {
        data.level = parent.level + 1;
      }
    }

    const [record] = await db
      .insert(schema.glHierarchy)
      .values({
        code: data.code,
        name: data.name,
        parent_hierarchy_id: data.parent_hierarchy_id ?? null,
        level: data.level ?? 0,
        sort_order: data.sort_order ?? 0,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 6. Update a hierarchy node */
  async updateGlHierarchy(id: number, data: Record<string, unknown>) {
    const [current] = await db
      .select()
      .from(schema.glHierarchy)
      .where(eq(schema.glHierarchy.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`GL hierarchy node not found: ${id}`);
    }

    // Prevent circular reference
    if (data.parent_hierarchy_id !== undefined && data.parent_hierarchy_id === id) {
      throw new Error('GL hierarchy node cannot reference itself as parent');
    }

    const allowedFields = ['code', 'name', 'parent_hierarchy_id', 'level', 'sort_order', 'description'] as const;

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    for (const f of allowedFields) {
      if (data[f] !== undefined) {
        setValues[f] = data[f];
      }
    }

    const [updated] = await db
      .update(schema.glHierarchy)
      .set(setValues)
      .where(eq(schema.glHierarchy.id, id))
      .returning();

    return updated;
  },

  /** 7. Return the full hierarchy as a tree structure */
  async getGlHierarchyTree() {
    const all = await db
      .select()
      .from(schema.glHierarchy)
      .orderBy(schema.glHierarchy.sort_order);

    type Node = (typeof all)[number] & { children: Node[] };

    const map = new Map<number, Node>();
    const roots: Node[] = [];

    // First pass: create nodes
    for (const row of all) {
      map.set(row.id, { ...row, children: [] });
    }

    // Second pass: link children
    for (const row of all) {
      const node = map.get(row.id)!;
      if (row.parent_hierarchy_id && map.has(row.parent_hierarchy_id)) {
        map.get(row.parent_hierarchy_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  },

  /** 8. Get a single hierarchy node by ID */
  async getGlHierarchy(id: number) {
    const [record] = await db
      .select()
      .from(schema.glHierarchy)
      .where(eq(schema.glHierarchy.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`GL hierarchy node not found: ${id}`);
    }
    return record;
  },

  // =========================================================================
  // GL Head (Chart of Accounts)
  // =========================================================================

  /**
   * 9. Create a GL head with business-rule validations:
   *   BR-001: Cannot recreate existing GL code
   *   BR-003 / GL-006: GL type must match category type
   *   BR-004: Contra GL cannot equal self
   *   Opening date required
   */
  async createGlHead(data: {
    code: string;
    name: string;
    gl_type: string;
    category_id: number;
    hierarchy_id?: number;
    parent_gl_id?: number;
    contra_gl_id?: number;
    book_code?: string;
    currency_restriction?: string;
    opening_date: string;
    is_manual_posting_allowed?: boolean;
    manual_restriction_effective_from?: string;
    is_revaluation_enabled?: boolean;
    is_customer_account_enabled?: boolean;
    is_nominal?: boolean;
    is_interunit?: boolean;
    nav_inclusion?: boolean;
    frpti_report_line?: string;
    frpti_schedule?: string;
    fs_mapping_code?: string;
    description?: string;
    created_by?: string;
  }) {
    // BR-001: Cannot recreate existing GL code
    const [existing] = await db
      .select({ id: schema.glHeads.id })
      .from(schema.glHeads)
      .where(eq(schema.glHeads.code, data.code))
      .limit(1);

    if (existing) {
      throw new Error(`[BR-001] GL head code '${data.code}' already exists. Cannot recreate an existing GL code.`);
    }

    // Validate category exists
    const [category] = await db
      .select()
      .from(schema.glCategories)
      .where(eq(schema.glCategories.id, data.category_id))
      .limit(1);

    if (!category) {
      throw new Error(`GL category not found: ${data.category_id}`);
    }

    // BR-003 / GL-006: GL type must match category type
    if (data.gl_type !== category.category_type) {
      throw new Error(
        `[BR-003/GL-006] GL type '${data.gl_type}' does not match category type '${category.category_type}' ` +
        `of category '${category.code}'. GL type must match its category type.`,
      );
    }

    // BR-004: Contra GL cannot equal self (checked conceptually: new record has no id yet, but the code must differ)
    // We check contra_gl_id at the ID level after insertion is not possible, so we verify the reference exists and is not the same code
    if (data.contra_gl_id !== undefined && data.contra_gl_id !== null) {
      const [contraGl] = await db
        .select({ id: schema.glHeads.id, code: schema.glHeads.code })
        .from(schema.glHeads)
        .where(eq(schema.glHeads.id, data.contra_gl_id))
        .limit(1);

      if (!contraGl) {
        throw new Error(`Contra GL head not found: ${data.contra_gl_id}`);
      }

      if (contraGl.code === data.code) {
        throw new Error(`[BR-004] Contra GL cannot equal the GL head itself (code '${data.code}')`);
      }
    }

    // Opening date is required (enforced at type level, but double-check)
    if (!data.opening_date) {
      throw new Error('Opening date is required when creating a GL head');
    }

    // Validate hierarchy if provided
    if (data.hierarchy_id) {
      const [hierarchy] = await db
        .select({ id: schema.glHierarchy.id })
        .from(schema.glHierarchy)
        .where(eq(schema.glHierarchy.id, data.hierarchy_id))
        .limit(1);

      if (!hierarchy) {
        throw new Error(`GL hierarchy node not found: ${data.hierarchy_id}`);
      }
    }

    const [record] = await db
      .insert(schema.glHeads)
      .values({
        code: data.code,
        name: data.name,
        gl_type: data.gl_type,
        category_id: data.category_id,
        hierarchy_id: data.hierarchy_id ?? null,
        parent_gl_id: data.parent_gl_id ?? null,
        contra_gl_id: data.contra_gl_id ?? null,
        book_code: data.book_code ?? null,
        account_status: 'OPEN',
        currency_restriction: data.currency_restriction ?? null,
        opening_date: data.opening_date,
        is_manual_posting_allowed: data.is_manual_posting_allowed ?? true,
        manual_restriction_effective_from: data.manual_restriction_effective_from ?? null,
        is_revaluation_enabled: data.is_revaluation_enabled ?? false,
        is_customer_account_enabled: data.is_customer_account_enabled ?? false,
        is_nominal: data.is_nominal ?? false,
        is_interunit: data.is_interunit ?? false,
        nav_inclusion: data.nav_inclusion ?? true,
        frpti_report_line: data.frpti_report_line ?? null,
        frpti_schedule: data.frpti_schedule ?? null,
        fs_mapping_code: data.fs_mapping_code ?? null,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 10. Update a GL head (code is immutable) */
  async updateGlHead(id: number, data: Record<string, unknown>) {
    const [current] = await db
      .select()
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`GL head not found: ${id}`);
    }

    if (data.code !== undefined && data.code !== current.code) {
      throw new Error('GL head code cannot be changed once created');
    }

    // BR-004: Contra GL cannot equal self
    if (data.contra_gl_id !== undefined && data.contra_gl_id === id) {
      throw new Error(`[BR-004] Contra GL cannot equal the GL head itself (id ${id})`);
    }

    // BR-003/GL-006: If gl_type or category_id are changing, validate they match
    if (data.gl_type !== undefined || data.category_id !== undefined) {
      const newType = (data.gl_type as string) ?? current.gl_type;
      const newCategoryId = (data.category_id as number) ?? current.category_id;

      const [cat] = await db
        .select()
        .from(schema.glCategories)
        .where(eq(schema.glCategories.id, newCategoryId))
        .limit(1);

      if (!cat) {
        throw new Error(`GL category not found: ${newCategoryId}`);
      }

      if (newType !== cat.category_type) {
        throw new Error(
          `[BR-003/GL-006] GL type '${newType}' does not match category type '${cat.category_type}'.`,
        );
      }
    }

    const allowedFields = [
      'name', 'gl_type', 'category_id', 'hierarchy_id', 'parent_gl_id',
      'contra_gl_id', 'book_code', 'account_status', 'currency_restriction',
      'opening_date', 'closing_date', 'is_manual_posting_allowed',
      'manual_restriction_effective_from', 'is_revaluation_enabled',
      'is_customer_account_enabled', 'is_nominal', 'is_interunit',
      'nav_inclusion', 'frpti_report_line', 'frpti_schedule',
      'fs_mapping_code', 'description',
    ] as const;

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    for (const f of allowedFields) {
      if (data[f] !== undefined) {
        setValues[f] = data[f];
      }
    }

    const [updated] = await db
      .update(schema.glHeads)
      .set(setValues)
      .where(eq(schema.glHeads.id, id))
      .returning();

    return updated;
  },

  /** 11. Close a GL head */
  async closeGlHead(id: number) {
    const [current] = await db
      .select()
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`GL head not found: ${id}`);
    }

    if (current.account_status === 'CLOSED') {
      throw new Error(`GL head '${current.code}' is already closed`);
    }

    const [updated] = await db
      .update(schema.glHeads)
      .set({
        account_status: 'CLOSED',
        closing_date: new Date().toISOString().split('T')[0],
        updated_at: new Date(),
      })
      .where(eq(schema.glHeads.id, id))
      .returning();

    return updated;
  },

  /** 12. List GL heads with search, pagination, and filters */
  async getGlHeads(
    search?: string,
    page?: number,
    limit?: number,
    filters?: { gl_type?: string; category_id?: number; account_status?: string },
  ) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];

    if (search) {
      conditions.push(
        or(
          like(schema.glHeads.code, `%${search}%`),
          like(schema.glHeads.name, `%${search}%`),
        )!,
      );
    }

    if (filters?.gl_type) {
      conditions.push(eq(schema.glHeads.gl_type, filters.gl_type as typeof schema.glHeads.gl_type.enumValues[number]));
    }

    if (filters?.category_id) {
      conditions.push(eq(schema.glHeads.category_id, filters.category_id));
    }

    if (filters?.account_status) {
      conditions.push(eq(schema.glHeads.account_status, filters.account_status as typeof schema.glHeads.account_status.enumValues[number]));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glHeads)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.glHeads.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glHeads)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },

  /** 13. Get a single GL head by ID with joined category and hierarchy */
  async getGlHead(id: number) {
    const [record] = await db
      .select()
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`GL head not found: ${id}`);
    }

    // Resolve category
    let category: { id: number; code: string; name: string; category_type: string } | null = null;
    if (record.category_id) {
      const [cat] = await db
        .select({
          id: schema.glCategories.id,
          code: schema.glCategories.code,
          name: schema.glCategories.name,
          category_type: schema.glCategories.category_type,
        })
        .from(schema.glCategories)
        .where(eq(schema.glCategories.id, record.category_id))
        .limit(1);
      category = cat ?? null;
    }

    // Resolve hierarchy
    let hierarchy: { id: number; code: string; name: string; level: number } | null = null;
    if (record.hierarchy_id) {
      const [hier] = await db
        .select({
          id: schema.glHierarchy.id,
          code: schema.glHierarchy.code,
          name: schema.glHierarchy.name,
          level: schema.glHierarchy.level,
        })
        .from(schema.glHierarchy)
        .where(eq(schema.glHierarchy.id, record.hierarchy_id))
        .limit(1);
      hierarchy = hier ?? null;
    }

    return { ...record, category, hierarchy };
  },

  /**
   * 14. Validate a GL head is eligible for posting.
   * Checks: OPEN status, currency allowed, manual posting allowed if isManual.
   */
  async validateGlForPosting(glHeadId: number, currency?: string, isManual?: boolean) {
    const [gl] = await db
      .select()
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, glHeadId))
      .limit(1);

    if (!gl) {
      throw new Error(`GL head not found: ${glHeadId}`);
    }

    const errors: string[] = [];

    // Must be OPEN
    if (gl.account_status !== 'OPEN') {
      errors.push(`GL '${gl.code}' is ${gl.account_status}; only OPEN accounts can receive postings`);
    }

    // Currency restriction check
    if (currency && gl.currency_restriction) {
      const allowedCurrencies = gl.currency_restriction.split(',').map((c: string) => c.trim().toUpperCase());
      if (!allowedCurrencies.includes(currency.toUpperCase())) {
        errors.push(
          `Currency '${currency}' is not in the allowed list [${gl.currency_restriction}] for GL '${gl.code}'`,
        );
      }
    }

    // Manual posting check
    if (isManual && !gl.is_manual_posting_allowed) {
      const effectiveFrom = gl.manual_restriction_effective_from;
      errors.push(
        `Manual posting is not allowed on GL '${gl.code}'` +
        (effectiveFrom ? ` (restricted since ${effectiveFrom})` : ''),
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      gl_code: gl.code,
      gl_name: gl.name,
      account_status: gl.account_status,
    };
  },

  // =========================================================================
  // GL Access Code
  // =========================================================================

  /** 15. Create a GL access code */
  async createGlAccessCode(data: {
    code: string;
    name: string;
    gl_head_id: number;
    accounting_unit_id?: number;
    is_active?: boolean;
    description?: string;
    created_by?: string;
  }) {
    // Validate GL head exists
    const [gl] = await db
      .select({ id: schema.glHeads.id })
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, data.gl_head_id))
      .limit(1);

    if (!gl) {
      throw new Error(`GL head not found: ${data.gl_head_id}`);
    }

    const [record] = await db
      .insert(schema.glAccessCodes)
      .values({
        code: data.code,
        name: data.name,
        gl_head_id: data.gl_head_id,
        accounting_unit_id: data.accounting_unit_id ?? null,
        is_active: data.is_active ?? true,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 16. List GL access codes, optionally filtered by GL head */
  async getGlAccessCodes(glHeadId?: number) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (glHeadId) {
      conditions.push(eq(schema.glAccessCodes.gl_head_id, glHeadId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glAccessCodes)
      .where(where)
      .orderBy(desc(schema.glAccessCodes.id));

    return data;
  },

  // =========================================================================
  // Accounting Unit
  // =========================================================================

  /** 17. Create an accounting unit */
  async createAccountingUnit(data: {
    code: string;
    name: string;
    branch_id?: number;
    legal_entity_id?: number;
    base_currency?: string;
    is_active?: boolean;
    description?: string;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.accountingUnits.id })
      .from(schema.accountingUnits)
      .where(eq(schema.accountingUnits.code, data.code))
      .limit(1);

    if (existing) {
      throw new Error(`Accounting unit code '${data.code}' already exists`);
    }

    const [record] = await db
      .insert(schema.accountingUnits)
      .values({
        code: data.code,
        name: data.name,
        branch_id: data.branch_id ?? null,
        legal_entity_id: data.legal_entity_id ?? null,
        base_currency: data.base_currency ?? 'PHP',
        is_active: data.is_active ?? true,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 18. List accounting units with search & pagination */
  async getAccountingUnits(search?: string, page?: number, limit?: number) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          like(schema.accountingUnits.code, `%${search}%`),
          like(schema.accountingUnits.name, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.accountingUnits)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.accountingUnits.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.accountingUnits)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },

  /** 19. Get a single accounting unit by ID */
  async getAccountingUnit(id: number) {
    const [record] = await db
      .select()
      .from(schema.accountingUnits)
      .where(eq(schema.accountingUnits.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`Accounting unit not found: ${id}`);
    }
    return record;
  },

  // =========================================================================
  // Fund Master
  // =========================================================================

  /** 20. Create a fund */
  async createFund(data: {
    fund_code: string;
    fund_name: string;
    fund_structure: string;
    fund_type: string;
    fund_currency?: string;
    nav_frequency?: string;
    first_nav_date?: string;
    first_eoy_date?: string;
    last_eoy_date?: string;
    unit_precision?: number;
    nav_decimals?: number;
    nav_rounding_method?: string;
    tax_on_interest?: boolean;
    default_operative_account?: string;
    valuation_basis?: string;
    accounting_unit_id?: number;
    is_active?: boolean;
    description?: string;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.fundMaster.id })
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.fund_code, data.fund_code))
      .limit(1);

    if (existing) {
      throw new Error(`Fund code '${data.fund_code}' already exists`);
    }

    // Validate accounting unit if provided
    if (data.accounting_unit_id) {
      const [au] = await db
        .select({ id: schema.accountingUnits.id })
        .from(schema.accountingUnits)
        .where(eq(schema.accountingUnits.id, data.accounting_unit_id))
        .limit(1);

      if (!au) {
        throw new Error(`Accounting unit not found: ${data.accounting_unit_id}`);
      }
    }

    const [record] = await db
      .insert(schema.fundMaster)
      .values({
        fund_code: data.fund_code,
        fund_name: data.fund_name,
        fund_structure: data.fund_structure,
        fund_type: data.fund_type,
        fund_currency: data.fund_currency ?? 'PHP',
        nav_frequency: data.nav_frequency ?? 'DAILY',
        first_nav_date: data.first_nav_date ?? null,
        first_eoy_date: data.first_eoy_date ?? null,
        last_eoy_date: data.last_eoy_date ?? null,
        unit_precision: data.unit_precision ?? 4,
        nav_decimals: data.nav_decimals ?? 4,
        nav_rounding_method: data.nav_rounding_method ?? 'ROUND_OFF',
        tax_on_interest: data.tax_on_interest ?? false,
        default_operative_account: data.default_operative_account ?? null,
        valuation_basis: data.valuation_basis ?? null,
        accounting_unit_id: data.accounting_unit_id ?? null,
        is_active: data.is_active ?? true,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 21. Update a fund */
  async updateFund(id: number, data: Record<string, unknown>) {
    const [current] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Fund not found: ${id}`);
    }

    const allowedFields = [
      'fund_name', 'fund_structure', 'fund_type', 'fund_currency',
      'nav_frequency', 'first_nav_date', 'first_eoy_date', 'last_eoy_date',
      'unit_precision', 'nav_decimals', 'nav_rounding_method',
      'tax_on_interest', 'default_operative_account', 'valuation_basis',
      'accounting_unit_id', 'is_active', 'description',
    ] as const;

    const setValues: Record<string, unknown> = {
      updated_at: new Date(),
      updated_by: (data.updated_by as string) ?? null,
    };

    for (const f of allowedFields) {
      if (data[f] !== undefined) {
        setValues[f] = data[f];
      }
    }

    const [updated] = await db
      .update(schema.fundMaster)
      .set(setValues)
      .where(eq(schema.fundMaster.id, id))
      .returning();

    return updated;
  },

  /** 22. List funds with search & pagination */
  async getFunds(search?: string, page?: number, limit?: number) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          like(schema.fundMaster.fund_code, `%${search}%`),
          like(schema.fundMaster.fund_name, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.fundMaster)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.fundMaster.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.fundMaster)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },

  /** 23. Get a single fund by ID */
  async getFund(id: number) {
    const [record] = await db
      .select()
      .from(schema.fundMaster)
      .where(eq(schema.fundMaster.id, id))
      .limit(1);

    if (!record) {
      throw new Error(`Fund not found: ${id}`);
    }
    return record;
  },

  // =========================================================================
  // FX Rates
  // =========================================================================

  /** 24. Create an FX rate entry */
  async createFxRate(data: {
    rate_type_code: string;
    rate_type?: string;
    rate_flag?: string;
    currency_from: string;
    currency_to: string;
    business_date: string;
    date_serial?: number;
    purchase_rate?: string;
    selling_rate?: string;
    mid_rate?: string;
    source?: string;
    created_by?: string;
  }) {
    const [record] = await db
      .insert(schema.fxRates)
      .values({
        rate_type_code: data.rate_type_code,
        rate_type: (data.rate_type ?? 'ACTUAL'),
        rate_flag: (data.rate_flag ?? 'DAILY'),
        currency_from: data.currency_from.toUpperCase(),
        currency_to: data.currency_to.toUpperCase(),
        business_date: data.business_date,
        date_serial: data.date_serial ?? 1,
        purchase_rate: data.purchase_rate ?? null,
        selling_rate: data.selling_rate ?? null,
        mid_rate: data.mid_rate ?? null,
        source: data.source ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 25. Get a specific FX rate for a currency pair, date, and optional rate type */
  async getFxRate(currFrom: string, currTo: string, businessDate: string, rateTypeCode?: string) {
    const conditions = [
      eq(schema.fxRates.currency_from, currFrom.toUpperCase()),
      eq(schema.fxRates.currency_to, currTo.toUpperCase()),
      eq(schema.fxRates.business_date, businessDate),
    ];

    if (rateTypeCode) {
      conditions.push(eq(schema.fxRates.rate_type_code, rateTypeCode));
    }

    const [record] = await db
      .select()
      .from(schema.fxRates)
      .where(and(...conditions))
      .orderBy(desc(schema.fxRates.date_serial))
      .limit(1);

    if (!record) {
      throw new Error(
        `FX rate not found: ${currFrom}/${currTo} on ${businessDate}` +
        (rateTypeCode ? ` (type: ${rateTypeCode})` : ''),
      );
    }

    return record;
  },

  /** 26. List all FX rates for a given date (or all if no date given) */
  async getFxRates(businessDate?: string) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (businessDate) {
      conditions.push(eq(schema.fxRates.business_date, businessDate));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.fxRates)
      .where(where)
      .orderBy(desc(schema.fxRates.business_date), schema.fxRates.currency_from);

    return data;
  },

  /**
   * 27. Validate that all required FX rates exist for EOD processing on a given date.
   * Checks every GL head with is_revaluation_enabled=true for a matching FX rate.
   */
  async validateFxRatesForEod(businessDate: string) {
    // Get all FCY GL heads that require revaluation
    const revalGls = await db
      .select({
        id: schema.glHeads.id,
        code: schema.glHeads.code,
        currency_restriction: schema.glHeads.currency_restriction,
      })
      .from(schema.glHeads)
      .where(
        and(
          eq(schema.glHeads.is_revaluation_enabled, true),
          eq(schema.glHeads.account_status, 'OPEN'),
        ),
      );

    // Get all rates available for the date
    const rates = await db
      .select()
      .from(schema.fxRates)
      .where(eq(schema.fxRates.business_date, businessDate));

    const availablePairs = new Set(
      rates.map((r: typeof rates[number]) => `${r.currency_from}/${r.currency_to}`),
    );

    const missingRates: { gl_code: string; currency: string }[] = [];

    for (const gl of revalGls) {
      if (!gl.currency_restriction) continue;

      const currencies = gl.currency_restriction
        .split(',')
        .map((c: string) => c.trim().toUpperCase())
        .filter((c: string) => c !== 'PHP'); // PHP is base currency; no rate needed

      for (const ccy of currencies) {
        if (!availablePairs.has(`${ccy}/PHP`) && !availablePairs.has(`PHP/${ccy}`)) {
          missingRates.push({ gl_code: gl.code, currency: ccy });
        }
      }
    }

    return {
      valid: missingRates.length === 0,
      business_date: businessDate,
      total_reval_gls: revalGls.length,
      rates_available: rates.length,
      missing_rates: missingRates,
    };
  },

  // =========================================================================
  // Financial Year / Period
  // =========================================================================

  /** 28. Create a financial year with periods */
  async createFinancialYear(data: {
    year_code: string;
    start_date: string;
    end_date: string;
    income_transfer_gl_id?: number;
    expense_transfer_gl_id?: number;
    retained_earnings_gl_id?: number;
    year_end_txn_code?: string;
    periods?: Array<{
      period_code: string;
      period_type: string;
      start_date: string;
      end_date: string;
    }>;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.glFinancialYears.id })
      .from(schema.glFinancialYears)
      .where(eq(schema.glFinancialYears.year_code, data.year_code))
      .limit(1);

    if (existing) {
      throw new Error(`Financial year '${data.year_code}' already exists`);
    }

    // Validate date range
    if (new Date(data.end_date) <= new Date(data.start_date)) {
      throw new Error('Financial year end_date must be after start_date');
    }

    const [year] = await db
      .insert(schema.glFinancialYears)
      .values({
        year_code: data.year_code,
        start_date: data.start_date,
        end_date: data.end_date,
        is_closed: false,
        income_transfer_gl_id: data.income_transfer_gl_id ?? null,
        expense_transfer_gl_id: data.expense_transfer_gl_id ?? null,
        retained_earnings_gl_id: data.retained_earnings_gl_id ?? null,
        year_end_txn_code: data.year_end_txn_code ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    // Create periods if provided
    const periods: (typeof schema.glFinancialPeriods.$inferSelect)[] = [];
    if (data.periods && data.periods.length > 0) {
      for (const pd of data.periods) {
        const [period] = await db
          .insert(schema.glFinancialPeriods)
          .values({
            year_id: year.id,
            period_code: pd.period_code,
            period_type: pd.period_type,
            start_date: pd.start_date,
            end_date: pd.end_date,
            is_closed: false,
            created_by: data.created_by ?? null,
            updated_by: data.created_by ?? null,
          })
          .returning();
        periods.push(period);
      }
    }

    return { ...year, periods };
  },

  /** 29. List all financial years */
  async getFinancialYears() {
    const data = await db
      .select()
      .from(schema.glFinancialYears)
      .orderBy(desc(schema.glFinancialYears.start_date));

    return data;
  },

  /** 30. Close a financial period */
  async closeFinancialPeriod(periodId: number, userId: number) {
    const [period] = await db
      .select()
      .from(schema.glFinancialPeriods)
      .where(eq(schema.glFinancialPeriods.id, periodId))
      .limit(1);

    if (!period) {
      throw new Error(`Financial period not found: ${periodId}`);
    }

    if (period.is_closed) {
      throw new Error(`Financial period '${period.period_code}' is already closed`);
    }

    const [updated] = await db
      .update(schema.glFinancialPeriods)
      .set({
        is_closed: true,
        closed_at: new Date(),
        closed_by: userId,
        updated_at: new Date(),
      })
      .where(eq(schema.glFinancialPeriods.id, periodId))
      .returning();

    return updated;
  },

  /** 31. Check whether a given date falls within an open financial period */
  async isDateInOpenPeriod(date: string) {
    const [period] = await db
      .select()
      .from(schema.glFinancialPeriods)
      .where(
        and(
          sql`${schema.glFinancialPeriods.start_date} <= ${date}`,
          sql`${schema.glFinancialPeriods.end_date} >= ${date}`,
          eq(schema.glFinancialPeriods.is_closed, false),
        ),
      )
      .limit(1);

    return {
      is_open: !!period,
      period: period ?? null,
    };
  },

  /** 32. Get the current financial year (the one whose date range includes today) */
  async getCurrentFinancialYear() {
    const today = new Date().toISOString().split('T')[0];

    const [year] = await db
      .select()
      .from(schema.glFinancialYears)
      .where(
        and(
          sql`${schema.glFinancialYears.start_date} <= ${today}`,
          sql`${schema.glFinancialYears.end_date} >= ${today}`,
        ),
      )
      .limit(1);

    if (!year) {
      throw new Error(`No financial year found for today (${today})`);
    }

    // Fetch associated periods
    const periods = await db
      .select()
      .from(schema.glFinancialPeriods)
      .where(eq(schema.glFinancialPeriods.year_id, year.id))
      .orderBy(schema.glFinancialPeriods.start_date);

    return { ...year, periods };
  },

  // =========================================================================
  // FRPTI & FS Mapping
  // =========================================================================

  /** 33. Create a FRPTI mapping */
  async createFrptiMapping(data: {
    gl_head_id: number;
    frpti_report_line: string;
    frpti_schedule: string;
    frpti_book?: string;
    effective_from: string;
    effective_to?: string;
    mapping_version?: number;
    description?: string;
    created_by?: string;
  }) {
    // Validate GL head exists
    const [gl] = await db
      .select({ id: schema.glHeads.id })
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, data.gl_head_id))
      .limit(1);

    if (!gl) {
      throw new Error(`GL head not found: ${data.gl_head_id}`);
    }

    const [record] = await db
      .insert(schema.frptiMappings)
      .values({
        gl_head_id: data.gl_head_id,
        frpti_report_line: data.frpti_report_line,
        frpti_schedule: data.frpti_schedule,
        frpti_book: (data.frpti_book ?? 'RBU'),
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        mapping_version: data.mapping_version ?? 1,
        description: data.description ?? null,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 34. List FRPTI mappings, optionally filtered by GL head */
  async getFrptiMappings(glHeadId?: number) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (glHeadId) {
      conditions.push(eq(schema.frptiMappings.gl_head_id, glHeadId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.frptiMappings)
      .where(where)
      .orderBy(desc(schema.frptiMappings.id));

    return data;
  },

  /** 35. Create a financial statement mapping */
  async createFsMapping(data: {
    gl_head_id: number;
    report_type: string;
    report_section: string;
    report_line: string;
    sort_order?: number;
    effective_from: string;
    effective_to?: string;
    mapping_version?: number;
    created_by?: string;
  }) {
    // Validate GL head exists
    const [gl] = await db
      .select({ id: schema.glHeads.id })
      .from(schema.glHeads)
      .where(eq(schema.glHeads.id, data.gl_head_id))
      .limit(1);

    if (!gl) {
      throw new Error(`GL head not found: ${data.gl_head_id}`);
    }

    const [record] = await db
      .insert(schema.fsMapping)
      .values({
        gl_head_id: data.gl_head_id,
        report_type: data.report_type,
        report_section: data.report_section,
        report_line: data.report_line,
        sort_order: data.sort_order ?? 0,
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        mapping_version: data.mapping_version ?? 1,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 36. List financial statement mappings, optionally filtered by report type */
  async getFsMappings(reportType?: string) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (reportType) {
      conditions.push(eq(schema.fsMapping.report_type, reportType));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.fsMapping)
      .where(where)
      .orderBy(schema.fsMapping.sort_order);

    return data;
  },

  // =========================================================================
  // Revaluation Parameters
  // =========================================================================

  /** 37. Create a revaluation parameter */
  async createRevalParameter(data: {
    gl_head_id: number;
    gain_gl_id: number;
    loss_gl_id: number;
    effective_from: string;
    effective_to?: string;
    revaluation_frequency?: string;
    is_active?: boolean;
    created_by?: string;
  }) {
    // Validate all GL head references
    for (const [label, glId] of [
      ['Source GL', data.gl_head_id],
      ['Gain GL', data.gain_gl_id],
      ['Loss GL', data.loss_gl_id],
    ] as const) {
      const [gl] = await db
        .select({ id: schema.glHeads.id })
        .from(schema.glHeads)
        .where(eq(schema.glHeads.id, glId))
        .limit(1);

      if (!gl) {
        throw new Error(`${label} head not found: ${glId}`);
      }
    }

    // Gain and loss GLs should differ from the source GL
    if (data.gain_gl_id === data.gl_head_id) {
      throw new Error('Gain GL must be different from the source GL head');
    }
    if (data.loss_gl_id === data.gl_head_id) {
      throw new Error('Loss GL must be different from the source GL head');
    }

    const [record] = await db
      .insert(schema.revalParameters)
      .values({
        gl_head_id: data.gl_head_id,
        gain_gl_id: data.gain_gl_id,
        loss_gl_id: data.loss_gl_id,
        effective_from: data.effective_from,
        effective_to: data.effective_to ?? null,
        revaluation_frequency: data.revaluation_frequency ?? 'DAILY',
        is_active: data.is_active ?? true,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 38. List revaluation parameters, optionally filtered by GL head */
  async getRevalParameters(glHeadId?: number) {
    const conditions: ReturnType<typeof eq>[] = [];

    if (glHeadId) {
      conditions.push(eq(schema.revalParameters.gl_head_id, glHeadId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.revalParameters)
      .where(where)
      .orderBy(desc(schema.revalParameters.id));

    return data;
  },

  // =========================================================================
  // Counterparty Master (GL)
  // =========================================================================

  /** 39. Create a GL counterparty with FRPTI classification */
  async createGlCounterparty(data: {
    counterparty_code: string;
    counterparty_name: string;
    counterparty_id?: number;
    frpti_sector?: string;
    frpti_sub_sector?: string;
    resident_status?: string;
    is_government?: boolean;
    country_code?: string;
    is_active?: boolean;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.glCounterpartyMaster.id })
      .from(schema.glCounterpartyMaster)
      .where(eq(schema.glCounterpartyMaster.counterparty_code, data.counterparty_code))
      .limit(1);

    if (existing) {
      throw new Error(`GL counterparty code '${data.counterparty_code}' already exists`);
    }

    const [record] = await db
      .insert(schema.glCounterpartyMaster)
      .values({
        counterparty_code: data.counterparty_code,
        counterparty_name: data.counterparty_name,
        counterparty_id: data.counterparty_id ?? null,
        frpti_sector: data.frpti_sector ?? null,
        frpti_sub_sector: data.frpti_sub_sector ?? null,
        resident_status: data.resident_status ? data.resident_status : null,
        is_government: data.is_government ?? false,
        country_code: data.country_code ?? null,
        is_active: data.is_active ?? true,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 40. List GL counterparties with search & pagination */
  async getGlCounterparties(search?: string, page?: number, limit?: number) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) {
      conditions.push(
        or(
          like(schema.glCounterpartyMaster.counterparty_code, `%${search}%`),
          like(schema.glCounterpartyMaster.counterparty_name, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glCounterpartyMaster)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.glCounterpartyMaster.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glCounterpartyMaster)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },

  // =========================================================================
  // Portfolio Master (GL)
  // =========================================================================

  /** 41. Create a GL portfolio */
  async createGlPortfolio(data: {
    portfolio_code: string;
    portfolio_name: string;
    fund_id?: number;
    portfolio_id?: number;
    accounting_unit_id?: number;
    product_class?: string;
    contractual_relationship?: string;
    discretionary_flag?: boolean;
    tax_exempt?: boolean;
    is_government_entity?: boolean;
    is_specialized_institutional?: boolean;
    base_currency?: string;
    is_active?: boolean;
    created_by?: string;
  }) {
    const [existing] = await db
      .select({ id: schema.glPortfolioMaster.id })
      .from(schema.glPortfolioMaster)
      .where(eq(schema.glPortfolioMaster.portfolio_code, data.portfolio_code))
      .limit(1);

    if (existing) {
      throw new Error(`GL portfolio code '${data.portfolio_code}' already exists`);
    }

    // Validate fund if provided
    if (data.fund_id) {
      const [fund] = await db
        .select({ id: schema.fundMaster.id })
        .from(schema.fundMaster)
        .where(eq(schema.fundMaster.id, data.fund_id))
        .limit(1);

      if (!fund) {
        throw new Error(`Fund not found: ${data.fund_id}`);
      }
    }

    // Validate accounting unit if provided
    if (data.accounting_unit_id) {
      const [au] = await db
        .select({ id: schema.accountingUnits.id })
        .from(schema.accountingUnits)
        .where(eq(schema.accountingUnits.id, data.accounting_unit_id))
        .limit(1);

      if (!au) {
        throw new Error(`Accounting unit not found: ${data.accounting_unit_id}`);
      }
    }

    const [record] = await db
      .insert(schema.glPortfolioMaster)
      .values({
        portfolio_code: data.portfolio_code,
        portfolio_name: data.portfolio_name,
        fund_id: data.fund_id ?? null,
        portfolio_id: data.portfolio_id ?? null,
        accounting_unit_id: data.accounting_unit_id ?? null,
        product_class: data.product_class ?? null,
        contractual_relationship: data.contractual_relationship ? data.contractual_relationship : null,
        discretionary_flag: data.discretionary_flag ?? false,
        tax_exempt: data.tax_exempt ?? false,
        is_government_entity: data.is_government_entity ?? false,
        is_specialized_institutional: data.is_specialized_institutional ?? false,
        base_currency: data.base_currency ?? 'PHP',
        is_active: data.is_active ?? true,
        created_by: data.created_by ?? null,
        updated_by: data.created_by ?? null,
      })
      .returning();

    return record;
  },

  /** 42. List GL portfolios, optionally filtered by fund, with search & pagination */
  async getGlPortfolios(fundId?: number, search?: string, page?: number, limit?: number) {
    const { page: p, limit: l, offset } = paginationDefaults(page, limit);

    const conditions: ReturnType<typeof eq>[] = [];

    if (fundId) {
      conditions.push(eq(schema.glPortfolioMaster.fund_id, fundId));
    }

    if (search) {
      conditions.push(
        or(
          like(schema.glPortfolioMaster.portfolio_code, `%${search}%`),
          like(schema.glPortfolioMaster.portfolio_name, `%${search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = await db
      .select()
      .from(schema.glPortfolioMaster)
      .where(where)
      .limit(l)
      .offset(offset)
      .orderBy(desc(schema.glPortfolioMaster.id));

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.glPortfolioMaster)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { data, total, page: p, limit: l };
  },
};
