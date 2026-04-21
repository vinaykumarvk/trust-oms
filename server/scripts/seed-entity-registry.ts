/**
 * Seed Entity Registry
 *
 * Inserts entity definitions into the entity_registry table and their
 * field configurations into entity_field_config. This seeds the EDEF
 * (Entity Definition Framework) so the generic CRUD pages can load
 * metadata from the server.
 *
 * Usage:
 *   npx tsx server/scripts/seed-entity-registry.ts
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { entityFieldDefaultsMap } from '@shared/entity-configs';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Entity registry definitions
// ---------------------------------------------------------------------------

interface EntityRegistryEntry {
  entity_key: string;
  display_name: string;
  display_name_plural: string;
  schema_table_name: string;
  category: 'reference-data' | 'master-data' | 'compliance' | 'operations';
  searchable_columns: string[];
  default_sort_column: string;
  max_page_size: number;
}

const entities: EntityRegistryEntry[] = [
  // Reference Data
  {
    entity_key: 'countries',
    display_name: 'Country',
    display_name_plural: 'Countries',
    schema_table_name: 'countries',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'currencies',
    display_name: 'Currency',
    display_name_plural: 'Currencies',
    schema_table_name: 'currencies',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'code',
    max_page_size: 100,
  },
  {
    entity_key: 'asset-classes',
    display_name: 'Asset Class',
    display_name_plural: 'Asset Classes',
    schema_table_name: 'asset_classes',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'branches',
    display_name: 'Branch',
    display_name_plural: 'Branches',
    schema_table_name: 'branches',
    category: 'reference-data',
    searchable_columns: ['code', 'name', 'region'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'exchanges',
    display_name: 'Exchange',
    display_name_plural: 'Exchanges',
    schema_table_name: 'exchanges',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'code',
    max_page_size: 100,
  },
  {
    entity_key: 'trust-product-types',
    display_name: 'Trust Product Type',
    display_name_plural: 'Trust Product Types',
    schema_table_name: 'trust_product_types',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'fee-types',
    display_name: 'Fee Type',
    display_name_plural: 'Fee Types',
    schema_table_name: 'fee_types',
    category: 'reference-data',
    searchable_columns: ['code', 'name'],
    default_sort_column: 'code',
    max_page_size: 100,
  },
  {
    entity_key: 'tax-codes',
    display_name: 'Tax Code',
    display_name_plural: 'Tax Codes',
    schema_table_name: 'tax_codes',
    category: 'reference-data',
    searchable_columns: ['code', 'name', 'type'],
    default_sort_column: 'code',
    max_page_size: 100,
  },

  // Master Data
  {
    entity_key: 'counterparties',
    display_name: 'Counterparty',
    display_name_plural: 'Counterparties',
    schema_table_name: 'counterparties',
    category: 'master-data',
    searchable_columns: ['name', 'lei', 'bic', 'type'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'brokers',
    display_name: 'Broker',
    display_name_plural: 'Brokers',
    schema_table_name: 'brokers',
    category: 'master-data',
    searchable_columns: [],
    default_sort_column: 'id',
    max_page_size: 100,
  },
  {
    entity_key: 'securities',
    display_name: 'Security',
    display_name_plural: 'Securities',
    schema_table_name: 'securities',
    category: 'master-data',
    searchable_columns: ['name', 'isin', 'cusip', 'sedol', 'bloomberg_ticker', 'local_code'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'portfolios',
    display_name: 'Portfolio',
    display_name_plural: 'Portfolios',
    schema_table_name: 'portfolios',
    category: 'master-data',
    searchable_columns: ['portfolio_id', 'client_id'],
    default_sort_column: 'portfolio_id',
    max_page_size: 100,
  },
  {
    entity_key: 'clients',
    display_name: 'Client',
    display_name_plural: 'Clients',
    schema_table_name: 'clients',
    category: 'master-data',
    searchable_columns: ['client_id', 'legal_name', 'type'],
    default_sort_column: 'legal_name',
    max_page_size: 100,
  },
  {
    entity_key: 'users',
    display_name: 'User',
    display_name_plural: 'Users',
    schema_table_name: 'users',
    category: 'master-data',
    searchable_columns: ['username', 'full_name', 'email', 'role'],
    default_sort_column: 'username',
    max_page_size: 100,
  },

  // BDO RFI Gap Entities
  {
    entity_key: 'model-portfolios',
    display_name: 'Model Portfolio',
    display_name_plural: 'Model Portfolios',
    schema_table_name: 'model_portfolios',
    category: 'operations',
    searchable_columns: ['name'],
    default_sort_column: 'name',
    max_page_size: 100,
  },
  {
    entity_key: 'compliance-limits',
    display_name: 'Compliance Limit',
    display_name_plural: 'Compliance Limits',
    schema_table_name: 'compliance_limits',
    category: 'compliance',
    searchable_columns: ['limit_type', 'dimension', 'dimension_id'],
    default_sort_column: 'limit_type',
    max_page_size: 100,
  },
  {
    entity_key: 'scheduled-plans',
    display_name: 'Scheduled Plan',
    display_name_plural: 'Scheduled Plans',
    schema_table_name: 'scheduled_plans',
    category: 'operations',
    searchable_columns: ['client_id', 'portfolio_id', 'plan_type'],
    default_sort_column: 'id',
    max_page_size: 100,
  },
  {
    entity_key: 'pera-accounts',
    display_name: 'PERA Account',
    display_name_plural: 'PERA Accounts',
    schema_table_name: 'pera_accounts',
    category: 'operations',
    searchable_columns: ['contributor_id', 'administrator', 'bsp_pera_id'],
    default_sort_column: 'id',
    max_page_size: 100,
  },
  {
    entity_key: 'held-away-assets',
    display_name: 'Held-Away Asset',
    display_name_plural: 'Held-Away Assets',
    schema_table_name: 'held_away_assets',
    category: 'master-data',
    searchable_columns: ['portfolio_id', 'asset_class', 'custodian'],
    default_sort_column: 'portfolio_id',
    max_page_size: 100,
  },
  {
    entity_key: 'standing-instructions',
    display_name: 'Standing Instruction',
    display_name_plural: 'Standing Instructions',
    schema_table_name: 'standing_instructions',
    category: 'operations',
    searchable_columns: ['account_id', 'portfolio_id', 'instruction_type'],
    default_sort_column: 'id',
    max_page_size: 100,
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

async function seedEntityRegistry() {
  console.log('Seeding entity registry...');

  for (const entity of entities) {
    // Upsert entity registry entry
    const existing = await db
      .select()
      .from(schema.entityRegistry)
      .where(eq(schema.entityRegistry.entity_key, entity.entity_key))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.entityRegistry)
        .set({
          display_name: entity.display_name,
          display_name_plural: entity.display_name_plural,
          schema_table_name: entity.schema_table_name,
          category: entity.category,
          searchable_columns: entity.searchable_columns,
          default_sort_column: entity.default_sort_column,
          max_page_size: entity.max_page_size,
          is_active: true,
        })
        .where(eq(schema.entityRegistry.entity_key, entity.entity_key));

      console.log(`  Updated: ${entity.entity_key}`);
    } else {
      await db.insert(schema.entityRegistry).values({
        entity_key: entity.entity_key,
        display_name: entity.display_name,
        display_name_plural: entity.display_name_plural,
        schema_table_name: entity.schema_table_name,
        category: entity.category,
        searchable_columns: entity.searchable_columns,
        default_sort_column: entity.default_sort_column,
        max_page_size: entity.max_page_size,
        is_active: true,
      });

      console.log(`  Inserted: ${entity.entity_key}`);
    }

    // Seed field configs from code-level defaults
    const fieldDefaults = entityFieldDefaultsMap[entity.entity_key];
    if (!fieldDefaults) {
      console.log(`  No field defaults found for ${entity.entity_key}, skipping fields.`);
      continue;
    }

    let fieldOrder = 0;
    for (const [fieldName, fieldDef] of Object.entries(fieldDefaults.fields)) {
      fieldOrder++;

      // Check if field config already exists
      const existingField = await db
        .select()
        .from(schema.entityFieldConfig)
        .where(eq(schema.entityFieldConfig.entity_key, entity.entity_key))
        .limit(1000);

      const fieldExists = existingField.some(
        (f: { field_name: string | null }) => f.field_name === fieldName,
      );

      if (fieldExists) {
        continue; // Don't overwrite existing server-side field configs
      }

      await db.insert(schema.entityFieldConfig).values({
        entity_key: entity.entity_key,
        field_name: fieldName,
        label: fieldDef.label,
        input_type: fieldDef.inputType ?? 'text',
        group_name: fieldDef.group ?? null,
        group_order: fieldDef.groupOrder ?? fieldOrder,
        display_order: fieldDef.displayOrder ?? fieldOrder,
        visible_in_table: fieldDef.visibleInTable ?? true,
        visible_in_form: fieldDef.visibleInForm ?? true,
        required: fieldDef.required ?? false,
        editable: fieldDef.editable ?? true,
        pii_sensitive: fieldDef.piiSensitive ?? false,
        validation_regex: fieldDef.validationRegex ?? null,
        unique_check: fieldDef.uniqueCheck ?? false,
        select_options_source: fieldDef.selectOptionsSource ?? null,
        help_text: fieldDef.helpText ?? null,
      });
    }

    console.log(
      `  Seeded ${Object.keys(fieldDefaults.fields).length} field configs for ${entity.entity_key}`,
    );
  }

  console.log('Entity registry seeding complete.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

seedEntityRegistry()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
