/**
 * Entity Registry API Routes
 *
 * Provides read endpoints for the entity registry, field configurations,
 * and entity metadata. Handles gracefully when tables don't exist yet.
 *
 * Endpoints:
 *   GET /api/v1/entity-registry              — List all registered entities
 *   GET /api/v1/entity-registry/:entityKey   — Get single entity with field configs
 *   GET /api/v1/entity-registry/:entityKey/fields — List field configs for an entity
 *
 * Returns mock data when the database tables are not yet populated.
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

// ---- Mock data for when DB tables don't exist yet ----

const mockEntities = [
  {
    entity_key: 'portfolios',
    display_name: 'Portfolios',
    category: 'master_data',
    schema_table_name: 'portfolios',
    is_active: true,
    tier: 1,
    description: 'Trust portfolio accounts',
  },
  {
    entity_key: 'securities',
    display_name: 'Securities',
    category: 'master_data',
    schema_table_name: 'securities',
    is_active: true,
    tier: 1,
    description: 'Financial instruments and securities',
  },
  {
    entity_key: 'clients',
    display_name: 'Clients',
    category: 'master_data',
    schema_table_name: 'clients',
    is_active: true,
    tier: 1,
    description: 'Trust clients and beneficiaries',
  },
  {
    entity_key: 'counterparties',
    display_name: 'Counterparties',
    category: 'master_data',
    schema_table_name: 'counterparties',
    is_active: true,
    tier: 2,
    description: 'Trading counterparties',
  },
  {
    entity_key: 'brokers',
    display_name: 'Brokers',
    category: 'master_data',
    schema_table_name: 'brokers',
    is_active: true,
    tier: 2,
    description: 'Broker dealers',
  },
  {
    entity_key: 'countries',
    display_name: 'Countries',
    category: 'reference_data',
    schema_table_name: 'countries',
    is_active: true,
    tier: 3,
    description: 'Country reference data',
  },
  {
    entity_key: 'currencies',
    display_name: 'Currencies',
    category: 'reference_data',
    schema_table_name: 'currencies',
    is_active: true,
    tier: 3,
    description: 'Currency reference data',
  },
  {
    entity_key: 'asset-classes',
    display_name: 'Asset Classes',
    category: 'reference_data',
    schema_table_name: 'asset_classes',
    is_active: true,
    tier: 3,
    description: 'Asset classification types',
  },
  {
    entity_key: 'branches',
    display_name: 'Branches',
    category: 'reference_data',
    schema_table_name: 'branches',
    is_active: true,
    tier: 3,
    description: 'Bank branches',
  },
  {
    entity_key: 'trust-product-types',
    display_name: 'Trust Product Types',
    category: 'reference_data',
    schema_table_name: 'trust_product_types',
    is_active: true,
    tier: 3,
    description: 'Types of trust products (UITF, IMA, etc.)',
  },
  {
    entity_key: 'fee-types',
    display_name: 'Fee Types',
    category: 'reference_data',
    schema_table_name: 'fee_types',
    is_active: true,
    tier: 3,
    description: 'Fee classification types',
  },
  {
    entity_key: 'tax-codes',
    display_name: 'Tax Codes',
    category: 'reference_data',
    schema_table_name: 'tax_codes',
    is_active: true,
    tier: 3,
    description: 'Tax code reference data',
  },
  {
    entity_key: 'exchanges',
    display_name: 'Exchanges',
    category: 'reference_data',
    schema_table_name: 'exchanges',
    is_active: true,
    tier: 3,
    description: 'Stock exchanges and trading venues',
  },
];

/**
 * Attempt to query the entity_registry table.
 * Returns null if the table does not exist.
 */
async function queryEntityRegistry(whereClause?: string, params?: unknown[]): Promise<unknown[] | null> {
  try {
    const sql = whereClause
      ? `SELECT * FROM entity_registry WHERE ${whereClause} ORDER BY category, display_name`
      : `SELECT * FROM entity_registry ORDER BY category, display_name`;
    const result = await pool.query(sql, params || []);
    return result.rows;
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    // 42P01 = undefined_table — table doesn't exist yet
    if (pgError.code === '42P01') {
      return null;
    }
    throw err;
  }
}

/**
 * Attempt to query entity_field_config for a given entity key.
 * Returns null if the table does not exist.
 */
async function queryFieldConfigs(entityKey: string): Promise<unknown[] | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM entity_field_config WHERE entity_key = $1 ORDER BY display_order`,
      [entityKey],
    );
    return result.rows;
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === '42P01') {
      return null;
    }
    throw err;
  }
}

// ============================================================================
// GET / — List all registered entities
// ============================================================================
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, active } = req.query;

    // Try database first
    let conditions: string[] = [];
    let params: unknown[] = [];
    let paramIdx = 1;

    if (category && typeof category === 'string') {
      conditions.push(`category = $${paramIdx++}`);
      params.push(category);
    }
    if (active !== undefined) {
      conditions.push(`is_active = $${paramIdx++}`);
      params.push(active === 'true');
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : undefined;
    const rows = await queryEntityRegistry(whereClause, params);

    if (rows !== null) {
      return res.json({ data: rows });
    }

    // Fallback to mock data
    let data = mockEntities;
    if (category && typeof category === 'string') {
      data = data.filter((e) => e.category === category);
    }
    if (active !== undefined) {
      const isActive = active === 'true';
      data = data.filter((e) => e.is_active === isActive);
    }

    res.json({ data, _mock: true });
  }),
);

// ============================================================================
// Helpers — transform DB rows to camelCase shape the client expects
// ============================================================================

function toClientEntity(entity: Record<string, unknown>, fields: Record<string, unknown>[]) {
  const clientFields = fields.map((f) => ({
    fieldName: f.field_name as string,
    label: f.label as string,
    group: (f.group_name as string) || undefined,
    groupOrder: f.group_order as number,
    displayOrder: f.display_order as number,
    inputType: (f.input_type as string) || 'text',
    required: !!f.required,
    editable: f.editable !== false,
    visibleInTable: f.visible_in_table !== false,
    visibleInForm: f.visible_in_form !== false,
    piiSensitive: !!f.pii_sensitive,
    validationRegex: (f.validation_regex as string) || undefined,
    uniqueCheck: !!f.unique_check,
    selectOptionsSource: (f.select_options_source as string) || undefined,
    helpText: (f.help_text as string) || undefined,
  }));

  // Derive fieldGroups from unique group names
  const groupSet = new Set<string>();
  for (const f of clientFields) {
    if (f.group) groupSet.add(f.group);
  }

  return {
    entityKey: entity.entity_key as string,
    displayName: entity.display_name as string,
    displayNamePlural: entity.display_name_plural as string,
    fieldGroups: Array.from(groupSet),
    fields: clientFields,
  };
}

function toClientMockEntity(entity: (typeof mockEntities)[number]) {
  return {
    entityKey: entity.entity_key,
    displayName: entity.display_name,
    displayNamePlural: entity.display_name,
    fieldGroups: [],
    fields: [],
  };
}

// ============================================================================
// GET /:entityKey — Get single entity with its field configs
// ============================================================================
router.get(
  '/:entityKey',
  asyncHandler(async (req: Request, res: Response) => {
    const { entityKey } = req.params;

    // Try database first
    const rows = await queryEntityRegistry('entity_key = $1', [entityKey]);

    if (rows !== null) {
      if (rows.length === 0) {
        return res.status(404).json({ message: `Entity '${entityKey}' not found` });
      }

      const fields = (await queryFieldConfigs(entityKey)) || [];
      return res.json(toClientEntity(rows[0] as Record<string, unknown>, fields as Record<string, unknown>[]));
    }

    // Fallback to mock data
    const mockEntity = mockEntities.find((e) => e.entity_key === entityKey);
    if (!mockEntity) {
      return res.status(404).json({ message: `Entity '${entityKey}' not found` });
    }

    res.json(toClientMockEntity(mockEntity));
  }),
);

// ============================================================================
// GET /:entityKey/fields — List field configs for an entity
// ============================================================================
router.get(
  '/:entityKey/fields',
  asyncHandler(async (req: Request, res: Response) => {
    const { entityKey } = req.params;

    // Try database first
    const fields = await queryFieldConfigs(entityKey);

    if (fields !== null) {
      return res.json({ data: fields });
    }

    // Fallback: empty fields (mock entities don't have field configs)
    res.json({ data: [], _mock: true });
  }),
);

export default router;
