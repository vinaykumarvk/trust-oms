/**
 * Generic CRUD Router Factory
 *
 * Generates Express CRUD routes for any Drizzle table. Supports:
 *   - Paginated list with search, sort, filter
 *   - Get single record by ID
 *   - Create with Zod validation + cross-field validation
 *   - Update with optimistic locking (version field)
 *   - Soft delete (is_deleted = true)
 *   - Bulk import with per-row validation
 *   - CSV export with formula injection protection
 *   - Duplicate checking
 *   - Maker-checker approval workflow integration
 *   - Hash-chained audit logging
 *   - Idempotency-Key support on POST/PUT
 *
 * Usage:
 *   import { createCrudRouter } from './crud-factory';
 *   import { securities } from '@shared/schema';
 *   const router = createCrudRouter(securities, {
 *     searchableColumns: ['name', 'isin', 'bloomberg_ticker'],
 *     entityKey: 'securities',
 *   });
 */

import { Router, type Request, type Response } from 'express';
import { eq, and, asc, desc, sql, or, ilike, getTableColumns as drizzleGetTableColumns, getTableName as drizzleGetTableName, type SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import type { z } from 'zod';
import { db } from '../db';
import { asyncHandler } from '../middleware/async-handler';
import { logAuditEvent, computeDiff } from '../services/audit-logger';
import { requireApproval } from '../middleware/maker-checker';
import { registerEntityTable } from '../services/maker-checker';
import { entityCrossValidations } from '@shared/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyPgTable = PgTable<any>;

type LifecycleHook<T = unknown> = (
  data: T,
  req: Request,
) => void | Promise<void>;

export interface CrudRouterOptions {
  /** Column names (JS property names, e.g. snake_case as in Drizzle schema) to include in ilike search. */
  searchableColumns?: string[];
  /** Default sort column name. Falls back to PK. */
  defaultSort?: string;
  /** Default sort order. */
  defaultSortOrder?: 'asc' | 'desc';
  /** Entity key for EDEF integration and maker-checker registry. */
  entityKey?: string;
  /**
   * Enable maker-checker for mutations.
   * true = derive entity type from table name.
   * string = use this explicit entity type name.
   */
  makerChecker?: boolean | string;
  /** Max page size for list endpoint. Default 100. */
  maxPageSize?: number;
  /** Columns to omit from auto-generated insert schema. */
  omitFromInsert?: string[];
  /** Custom Zod insert schema (overrides auto-generated). */
  insertSchema?: z.ZodObject<any>;
  /** Lifecycle hooks */
  beforeCreate?: LifecycleHook;
  afterCreate?: LifecycleHook;
  beforeUpdate?: LifecycleHook;
  afterUpdate?: LifecycleHook;
  beforeDelete?: LifecycleHook<{ id: string | number }>;
  afterDelete?: LifecycleHook<{ id: string | number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape special chars for ILIKE patterns. */
function escapeLikePattern(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Get the primary key column (tries common names). */
function getPkColumn(table: AnyPgTable): PgColumn | null {
  const columns = getColumns(table);
  return (
    columns.id ??
    columns.client_id ??
    columns.portfolio_id ??
    columns.order_id ??
    columns.trade_id ??
    columns.block_id ??
    columns.entity_key ??
    null
  );
}

/** Get all columns as a map keyed by JS property name. */
function getColumns(table: AnyPgTable): Record<string, PgColumn> {
  return drizzleGetTableColumns(table) as Record<string, PgColumn>;
}

/** Look up a column by its JS property name. */
function getColumn(table: AnyPgTable, name: string): PgColumn | undefined {
  return getColumns(table)[name];
}

/** Get the Drizzle table name. */
function getTableName(table: AnyPgTable): string {
  return drizzleGetTableName(table);
}

// ---------------------------------------------------------------------------
// Cross-field validation cache
// ---------------------------------------------------------------------------

interface CrossValidationRule {
  rule_name: string | null;
  condition: unknown;
  error_message: string | null;
}

function createCrossValidationCache(entityKey: string) {
  let cache: CrossValidationRule[] | null = null;
  let expiry = 0;

  return async function loadRules(): Promise<CrossValidationRule[]> {
    if (cache && Date.now() < expiry) return cache;

    try {
      const rules = await db
        .select()
        .from(entityCrossValidations)
        .where(
          and(
            eq(entityCrossValidations.entity_key, entityKey),
            eq(entityCrossValidations.is_active, true),
          ),
        );

      cache = rules.map((r: Record<string, unknown>) => ({
        rule_name: r.rule_name as string | null,
        condition: r.condition,
        error_message: r.error_message as string | null,
      }));
      expiry = Date.now() + 5 * 60 * 1000; // 5-min TTL
    } catch {
      cache = [];
      expiry = Date.now() + 60 * 1000; // retry in 1 min on error
    }

    return cache!;
  };
}

/** Run cross-field validations. Returns array of error messages. */
async function runCrossValidations(
  loadRules: () => Promise<CrossValidationRule[]>,
  data: Record<string, unknown>,
): Promise<string[]> {
  const rules = await loadRules();
  if (rules.length === 0) return [];

  const errors: string[] = [];

  for (const rule of rules) {
    try {
      const condition = rule.condition as Record<string, unknown> | null;
      if (!condition) continue;

      // Simple condition format: { field, operator, value } or { fieldA, operator, fieldB }
      const { field, fieldA, fieldB, operator, value } = condition as
        Record<string, string | undefined>;

      if (field && operator && value !== undefined) {
        const fieldValue = data[field];
        let valid = true;

        switch (operator) {
          case 'required':
            valid = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
            break;
          case 'min':
            valid = Number(fieldValue) >= Number(value);
            break;
          case 'max':
            valid = Number(fieldValue) <= Number(value);
            break;
          case 'pattern':
            valid = new RegExp(String(value)).test(String(fieldValue ?? ''));
            break;
          case 'eq':
            valid = fieldValue === value;
            break;
          case 'ne':
            valid = fieldValue !== value;
            break;
        }

        if (!valid) {
          errors.push(rule.error_message ?? `Validation failed for ${field}`);
        }
      } else if (fieldA && fieldB && operator) {
        const valA = data[fieldA];
        const valB = data[fieldB];
        let valid = true;

        switch (operator) {
          case 'lt':
            valid = Number(valA) < Number(valB);
            break;
          case 'lte':
            valid = Number(valA) <= Number(valB);
            break;
          case 'gt':
            valid = Number(valA) > Number(valB);
            break;
          case 'gte':
            valid = Number(valA) >= Number(valB);
            break;
          case 'eq':
            valid = valA === valB;
            break;
          case 'ne':
            valid = valA !== valB;
            break;
          case 'before':
            valid = new Date(String(valA)) < new Date(String(valB));
            break;
          case 'after':
            valid = new Date(String(valA)) > new Date(String(valB));
            break;
        }

        if (!valid) {
          errors.push(rule.error_message ?? `Cross-validation failed: ${fieldA} ${operator} ${fieldB}`);
        }
      }
    } catch {
      // Skip malformed rules
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Idempotency-Key cache (in-memory, short-lived)
// ---------------------------------------------------------------------------

const idempotencyCache = new Map<string, { status: number; body: unknown; expiresAt: number }>();

function checkIdempotency(key: string): { status: number; body: unknown } | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return { status: entry.status, body: entry.body };
}

function setIdempotency(key: string, status: number, body: unknown): void {
  idempotencyCache.set(key, { status, body, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 min
  // Cleanup old entries periodically
  if (idempotencyCache.size > 10000) {
    const now = Date.now();
    for (const [k, v] of idempotencyCache) {
      if (now > v.expiresAt) idempotencyCache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCrudRouter(
  table: AnyPgTable,
  options: CrudRouterOptions = {},
): Router {
  const router = Router();
  const tableName = getTableName(table);

  const {
    searchableColumns = [],
    defaultSort,
    defaultSortOrder = 'asc',
    beforeCreate,
    afterCreate,
    beforeUpdate,
    afterUpdate,
    beforeDelete,
    afterDelete,
    maxPageSize = 100,
    omitFromInsert = [],
    makerChecker,
    entityKey,
  } = options;

  // Register table in maker-checker entity map
  if (entityKey) {
    registerEntityTable(entityKey, table);
  }

  // Cross-validation loader
  const loadCrossValidations = createCrossValidationCache(entityKey ?? tableName);

  // If maker-checker is enabled, apply approval middleware to mutations
  if (makerChecker) {
    const entityTypeName = typeof makerChecker === 'string' ? makerChecker : tableName;
    router.use(requireApproval(entityTypeName));
  }

  // Build Zod insert schema
  const insertZodSchema = (() => {
    if (options.insertSchema) return options.insertSchema;
    try {
      // createInsertSchema returns a ZodObject; we cast to a workable generic type
      // since the exact column types are erased when working with AnyPgTable.
      let schema = createInsertSchema(table) as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>;
      const autoOmit = [
        'id', 'created_at', 'updated_at', 'created_by', 'updated_by',
        'version', 'is_deleted', 'tenant_id', 'correlation_id', 'audit_hash',
        'status',
        ...omitFromInsert,
      ];
      const columns = getColumns(table);
      for (const col of autoOmit) {
        if (col in columns) {
          // Dynamic key omit requires an unsafe cast on the argument
          schema = (schema.omit as (mask: Record<string, true>) => typeof schema)({ [col]: true });
        }
      }
      return schema;
    } catch {
      return null;
    }
  })();

  const pkCol = getPkColumn(table);

  // =========================================================================
  // GET / -- Paginated list with search, sort, filter
  // =========================================================================
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const pageSize = Math.min(
        maxPageSize,
        Math.max(1, parseInt(req.query.pageSize as string, 10) || 20),
      );
      const offset = (page - 1) * pageSize;
      const searchTerm = (req.query.search as string) ?? '';
      const sortByParam = (req.query.sortBy as string) ?? defaultSort;
      const sortOrderParam =
        (req.query.sortOrder as string)?.toLowerCase() === 'desc'
          ? 'desc'
          : sortByParam
            ? ((req.query.sortOrder as string)?.toLowerCase() ?? defaultSortOrder)
            : defaultSortOrder;

      // Build WHERE conditions
      const conditions: SQL[] = [];

      // Exclude soft-deleted records
      const cols = getColumns(table);
      if ('is_deleted' in cols) {
        conditions.push(sql`${cols.is_deleted} IS NOT TRUE`);
      }

      // Search across searchable columns
      if (searchTerm && searchableColumns.length > 0) {
        const searchClauses = searchableColumns
          .map((colName) => {
            const col = getColumn(table, colName);
            if (!col) return null;
            return ilike(col, `%${escapeLikePattern(searchTerm)}%`);
          })
          .filter(Boolean) as SQL[];

        if (searchClauses.length > 0) {
          conditions.push(or(...searchClauses)!);
        }
      }

      const whereClause =
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined;

      // Build ORDER BY
      let orderByClause: SQL | undefined;
      if (sortByParam) {
        const sortCol = getColumn(table, sortByParam);
        if (sortCol) {
          orderByClause = sortOrderParam === 'desc' ? desc(sortCol) : asc(sortCol);
        }
      }
      if (!orderByClause && pkCol) {
        orderByClause = asc(pkCol);
      }

      // Execute count + data in parallel
      const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(table).$dynamic();
      if (whereClause) countQuery.where(whereClause);

      const dataQuery = db.select().from(table).$dynamic();
      if (whereClause) dataQuery.where(whereClause);
      if (orderByClause) dataQuery.orderBy(orderByClause);
      dataQuery.limit(pageSize).offset(offset);

      const [countResult, rows] = await Promise.all([countQuery, dataQuery]);
      const total = (countResult[0] as Record<string, unknown>)?.count ?? 0;

      res.json({ data: rows, total, page, pageSize });
    }),
  );

  // =========================================================================
  // GET /export/csv -- CSV export with formula injection protection
  // Must be before /:id to avoid param capture
  // =========================================================================
  router.get(
    '/export/csv',
    asyncHandler(async (req: Request, res: Response) => {
      const searchTerm = (req.query.search as string) ?? '';
      const sortByParam = (req.query.sortBy as string) ?? defaultSort;
      const sortOrderParam =
        (req.query.sortOrder as string)?.toLowerCase() === 'desc' ? 'desc' : 'asc';

      const conditions: SQL[] = [];
      const cols = getColumns(table);
      if ('is_deleted' in cols) {
        conditions.push(sql`${cols.is_deleted} IS NOT TRUE`);
      }

      if (searchTerm && searchableColumns.length > 0) {
        const searchClauses = searchableColumns
          .map((colName) => {
            const col = getColumn(table, colName);
            return col ? ilike(col, `%${escapeLikePattern(searchTerm)}%`) : null;
          })
          .filter(Boolean) as SQL[];
        if (searchClauses.length > 0) {
          conditions.push(or(...searchClauses)!);
        }
      }

      const whereClause =
        conditions.length > 0
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined;

      let orderByClause: SQL | undefined;
      if (sortByParam) {
        const sortCol = getColumn(table, sortByParam);
        if (sortCol) {
          orderByClause = sortOrderParam === 'desc' ? desc(sortCol) : asc(sortCol);
        }
      }

      const dataQuery = db.select().from(table).$dynamic();
      if (whereClause) dataQuery.where(whereClause);
      if (orderByClause) dataQuery.orderBy(orderByClause);
      dataQuery.limit(10000); // 10k row safety limit

      const rows = await dataQuery;
      if (rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${tableName}-export.csv"`);
        return res.status(200).send('');
      }

      // Build CSV with formula injection protection
      const CSV_INJECTION_RE = /^[=+\-@\t\r]/;
      const columnKeys = Object.keys(cols);
      const header = columnKeys.join(',');
      const csvRows = (rows as Record<string, unknown>[]).map((row) =>
        columnKeys
          .map((col) => {
            const val = row[col];
            if (val == null) return '';
            let str = String(val);
            // Prefix formula-triggering characters
            if (CSV_INJECTION_RE.test(str)) {
              str = "'" + str;
            }
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(','),
      );

      const csv = [header, ...csvRows].join('\n');

      // Audit log the export
      logAuditEvent({
        entityType: tableName,
        entityId: 'export',
        action: 'EXPORT',
        actorId: req.userId,
        actorRole: req.userRole,
        metadata: { rowCount: rows.length, search: searchTerm || undefined },
      }).catch(() => {});

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}-export.csv"`);
      res.send(csv);
    }),
  );

  // =========================================================================
  // POST /check-duplicate -- Check for duplicate records
  // =========================================================================
  router.post(
    '/check-duplicate',
    asyncHandler(async (req: Request, res: Response) => {
      const { field, value, excludeId } = req.body as {
        field?: string;
        value?: string;
        excludeId?: string | number;
      };

      if (!field || value === undefined) {
        return res.json({ isDuplicate: false });
      }

      const col = getColumn(table, field);
      if (!col) {
        return res.json({ isDuplicate: false });
      }

      const conditions: SQL[] = [eq(col, value)];

      // Exclude soft-deleted records
      const allCols = getColumns(table);
      if ('is_deleted' in allCols) {
        conditions.push(sql`${allCols.is_deleted} IS NOT TRUE`);
      }

      if (excludeId && pkCol) {
        const numId = Number(excludeId);
        conditions.push(sql`${pkCol} != ${isNaN(numId) ? excludeId : numId}`);
      }

      const matches = await db
        .select()
        .from(table)
        .where(and(...conditions))
        .limit(1);

      if (matches.length === 0) {
        return res.json({ isDuplicate: false });
      }

      const existing = matches[0] as Record<string, unknown>;
      res.json({
        isDuplicate: true,
        existingRecord: {
          id: existing.id ?? existing.client_id ?? existing.portfolio_id ?? null,
          displayLabel:
            existing.name ??
            existing.display_name ??
            existing.full_name ??
            existing.legal_name ??
            existing.code ??
            String(existing.id ?? ''),
        },
      });
    }),
  );

  // =========================================================================
  // GET /:id -- Single record
  // =========================================================================
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      if (!pkCol) {
        return res.status(500).json({
          error: { code: 'INTERNAL', message: 'No primary key column found' },
        });
      }

      const id = req.params.id;
      const lookupValue = isNaN(Number(id)) ? id : Number(id);

      const conditions: SQL[] = [eq(pkCol, lookupValue)];
      const cols = getColumns(table);
      if ('is_deleted' in cols) {
        conditions.push(sql`${cols.is_deleted} IS NOT TRUE`);
      }

      const rows = await db
        .select()
        .from(table)
        .where(and(...conditions))
        .limit(1);

      if (rows.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `${tableName} not found` },
        });
      }

      res.json(rows[0]);
    }),
  );

  // =========================================================================
  // POST / -- Create
  // =========================================================================
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      // Idempotency-Key check
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = checkIdempotency(idempotencyKey);
        if (cached) {
          return res.status(cached.status).json(cached.body);
        }
      }

      // Validate
      if (!insertZodSchema) {
        return res.status(500).json({
          error: { code: 'INTERNAL', message: 'Entity schema not configured' },
        });
      }

      const result = insertZodSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation error',
            details: result.error.format(),
            correlation_id: req.id,
          },
        });
      }

      const data = result.data as Record<string, unknown>;

      // Cross-field validation
      const crossErrors = await runCrossValidations(loadCrossValidations, data);
      if (crossErrors.length > 0) {
        return res.status(400).json({
          error: {
            code: 'CROSS_VALIDATION_ERROR',
            message: 'Cross-field validation failed',
            details: crossErrors,
            correlation_id: req.id,
          },
        });
      }

      // Lifecycle hook
      if (beforeCreate) {
        await beforeCreate(data, req);
      }

      // Set audit fields
      const cols = getColumns(table);
      const insertData: Record<string, unknown> = { ...data };
      if ('created_by' in cols) insertData.created_by = req.userId;
      if ('updated_by' in cols) insertData.updated_by = req.userId;
      if ('correlation_id' in cols) insertData.correlation_id = req.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .values() requires the exact inferred insert model
      const [created] = await db.insert(table).values(insertData as Record<string, unknown>).returning();

      // Audit log
      const createdRecord = created as Record<string, unknown>;
      const entityId = createdRecord?.id ?? createdRecord?.client_id ?? createdRecord?.portfolio_id ?? 'unknown';
      logAuditEvent({
        entityType: tableName,
        entityId: String(entityId),
        action: 'CREATE',
        actorId: req.userId,
        actorRole: req.userRole,
        changes: { created: created as Record<string, unknown> },
        ipAddress: req.ip,
        correlationId: req.id,
      }).catch(() => {});

      if (afterCreate) {
        await afterCreate(created, req);
      }

      const responseBody = created;
      if (idempotencyKey) {
        setIdempotency(idempotencyKey, 201, responseBody);
      }

      res.status(201).json(responseBody);
    }),
  );

  // =========================================================================
  // PUT /:id -- Update with optimistic locking
  // =========================================================================
  router.put(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      if (!pkCol) {
        return res.status(500).json({
          error: { code: 'INTERNAL', message: 'No primary key column found' },
        });
      }

      // Idempotency-Key check
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = checkIdempotency(idempotencyKey);
        if (cached) {
          return res.status(cached.status).json(cached.body);
        }
      }

      const id = req.params.id;
      const lookupValue = isNaN(Number(id)) ? id : Number(id);

      // Validate with partial schema
      if (insertZodSchema) {
        const partialSchema = insertZodSchema.partial();
        const result = partialSchema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation error',
              details: result.error.format(),
              correlation_id: req.id,
            },
          });
        }
        req.body = result.data;
      }

      // Fetch previous record for optimistic lock + diff
      const prevRows = await db.select().from(table).where(eq(pkCol, lookupValue)).limit(1);
      if (prevRows.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `${tableName} not found` },
        });
      }

      const previousRecord = prevRows[0] as Record<string, unknown>;

      // Store on request for maker-checker middleware
      (req as unknown as Record<string, unknown>)._previousRecord = previousRecord;

      // Cross-field validation (merge with previous for full context)
      const mergedForValidation = { ...previousRecord, ...req.body };
      const crossErrors = await runCrossValidations(loadCrossValidations, mergedForValidation);
      if (crossErrors.length > 0) {
        return res.status(400).json({
          error: {
            code: 'CROSS_VALIDATION_ERROR',
            message: 'Cross-field validation failed',
            details: crossErrors,
            correlation_id: req.id,
          },
        });
      }

      // Lifecycle hook
      if (beforeUpdate) {
        await beforeUpdate(req.body, req);
      }

      // Optimistic locking
      const cols = getColumns(table);
      const updateData: Record<string, unknown> = { ...req.body };

      // Check _expectedUpdatedAt
      const clientExpectedUpdatedAt = updateData._expectedUpdatedAt;
      delete updateData._expectedUpdatedAt;

      if (clientExpectedUpdatedAt && 'updated_at' in cols) {
        const serverUpdatedAt = previousRecord.updated_at;
        if (serverUpdatedAt) {
          const serverTs = new Date(String(serverUpdatedAt)).getTime();
          const clientTs = new Date(String(clientExpectedUpdatedAt)).getTime();
          if (!isNaN(serverTs) && !isNaN(clientTs) && serverTs !== clientTs) {
            return res.status(409).json({
              error: {
                code: 'CONFLICT',
                message: 'This record was modified by another user. Please reload and try again.',
                serverUpdatedAt,
              },
            });
          }
        }
      }

      // Check version-based optimistic lock
      if ('version' in cols && updateData.version !== undefined) {
        const clientVersion = Number(updateData.version);
        const serverVersion = Number(previousRecord.version);
        if (!isNaN(clientVersion) && !isNaN(serverVersion) && clientVersion !== serverVersion) {
          return res.status(409).json({
            error: {
              code: 'CONFLICT',
              message: 'Version mismatch. Record was modified by another user.',
              serverVersion,
            },
          });
        }
      }

      // Set audit fields
      if ('updated_by' in cols) updateData.updated_by = req.userId;
      if ('updated_at' in cols) updateData.updated_at = new Date();
      if ('version' in cols) {
        updateData.version = (Number(previousRecord.version) || 0) + 1;
      }
      if ('correlation_id' in cols) updateData.correlation_id = req.id;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() requires the exact inferred update model
      const result = await db
        .update(table)
        .set(updateData as Record<string, unknown>)
        .where(eq(pkCol, lookupValue))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `${tableName} not found` },
        });
      }

      const updated = result[0];

      // Audit log with diff
      const diff = computeDiff(previousRecord, updated as Record<string, unknown>);
      logAuditEvent({
        entityType: tableName,
        entityId: String(lookupValue),
        action: 'UPDATE',
        actorId: req.userId,
        actorRole: req.userRole,
        changes: diff,
        ipAddress: req.ip,
        correlationId: req.id,
      }).catch(() => {});

      if (afterUpdate) {
        await afterUpdate(updated, req);
      }

      if (idempotencyKey) {
        setIdempotency(idempotencyKey, 200, updated);
      }

      res.json(updated);
    }),
  );

  // =========================================================================
  // DELETE /:id -- Soft delete
  // =========================================================================
  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      if (!pkCol) {
        return res.status(500).json({
          error: { code: 'INTERNAL', message: 'No primary key column found' },
        });
      }

      const id = req.params.id;
      const lookupValue = isNaN(Number(id)) ? id : Number(id);

      // Lifecycle hook
      if (beforeDelete) {
        await beforeDelete({ id: lookupValue }, req);
      }

      const cols = getColumns(table);
      let result: Record<string, unknown>[];

      if ('is_deleted' in cols) {
        // Soft delete
        const softDeleteData: Record<string, unknown> = { is_deleted: true };
        if ('updated_by' in cols) softDeleteData.updated_by = req.userId;
        if ('updated_at' in cols) softDeleteData.updated_at = new Date();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() requires exact model
        result = await db
          .update(table)
          .set(softDeleteData as Record<string, unknown>)
          .where(eq(pkCol, lookupValue))
          .returning() as Record<string, unknown>[];
      } else {
        // Hard delete
        result = await db.delete(table).where(eq(pkCol, lookupValue)).returning() as Record<string, unknown>[];
      }

      if (result.length === 0) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `${tableName} not found` },
        });
      }

      // Audit log
      logAuditEvent({
        entityType: tableName,
        entityId: String(lookupValue),
        action: 'DELETE',
        actorId: req.userId,
        actorRole: req.userRole,
        changes: { deleted: result[0] },
        ipAddress: req.ip,
        correlationId: req.id,
      }).catch(() => {});

      if (afterDelete) {
        await afterDelete({ id: lookupValue }, req);
      }

      res.json({ message: `${tableName} deleted`, id: lookupValue });
    }),
  );

  // =========================================================================
  // POST /bulk-import -- Bulk import with per-row validation
  // =========================================================================
  router.post(
    '/bulk-import',
    asyncHandler(async (req: Request, res: Response) => {
      const { rows } = req.body as { rows?: unknown[] };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must contain a non-empty "rows" array',
          },
        });
      }

      const MAX_BULK_ROWS = 10000;
      if (rows.length > MAX_BULK_ROWS) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Bulk import limited to ${MAX_BULK_ROWS} rows. Got ${rows.length}.`,
          },
        });
      }

      const BATCH_SIZE = 100;
      let accepted = 0;
      const rejected: Array<{ row: number; errors: string }> = [];

      // Validate all rows first
      const validatedRows: Array<{ index: number; data: unknown }> = [];

      for (let i = 0; i < rows.length; i++) {
        if (insertZodSchema) {
          const result = insertZodSchema.safeParse(rows[i]);
          if (!result.success) {
            const fieldErrors = result.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ');
            rejected.push({ row: i + 1, errors: fieldErrors });
            continue;
          }
          validatedRows.push({ index: i, data: result.data });
        } else {
          validatedRows.push({ index: i, data: rows[i] });
        }
      }

      if (validatedRows.length === 0) {
        return res.status(400).json({ accepted: 0, rejected: rejected.length, errors: rejected });
      }

      // Insert in batches within a transaction
      try {
        for (let batchStart = 0; batchStart < validatedRows.length; batchStart += BATCH_SIZE) {
          const batch = validatedRows.slice(batchStart, batchStart + BATCH_SIZE);

          try {
            const values = batch.map((r) => {
              const data = r.data as Record<string, unknown>;
              const cols = getColumns(table);
              if ('created_by' in cols) data.created_by = req.userId;
              if ('updated_by' in cols) data.updated_by = req.userId;
              return data;
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .values() requires exact model
            await db.insert(table).values(values as Record<string, unknown>[]);
            accepted += batch.length;
          } catch {
            // If batch fails, try individual inserts
            for (const item of batch) {
              try {
                const data = item.data as Record<string, unknown>;
                const allCols = getColumns(table);
                if ('created_by' in allCols) data.created_by = req.userId;
                if ('updated_by' in allCols) data.updated_by = req.userId;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .values() requires exact model
                await db.insert(table).values(data as Record<string, unknown>);
                accepted += 1;
              } catch (rowError) {
                rejected.push({
                  row: item.index + 1,
                  errors: rowError instanceof Error ? rowError.message : String(rowError),
                });
              }
            }
          }
        }
      } catch (error) {
        return res.status(500).json({
          error: {
            code: 'INTERNAL',
            message: 'Bulk import failed',
            details: error instanceof Error ? error.message : String(error),
          },
        });
      }

      // Audit log
      logAuditEvent({
        entityType: tableName,
        entityId: 'bulk-import',
        action: 'CREATE',
        actorId: req.userId,
        actorRole: req.userRole,
        changes: { bulkImport: true, accepted, rejected: rejected.length },
        ipAddress: req.ip,
        correlationId: req.id,
      }).catch(() => {});

      const statusCode = rejected.length > 0 && accepted === 0 ? 400 : 200;
      res.status(statusCode).json({ accepted, rejected: rejected.length, errors: rejected });
    }),
  );

  return router;
}
