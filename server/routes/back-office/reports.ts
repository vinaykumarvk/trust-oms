/**
 * Reports & Analytics Hub API Routes (Phase 5A)
 *
 * Endpoints for regulatory and internal report generation,
 * data quality checks, ad-hoc querying, and query templates.
 *
 *   GET    /catalogue    -- Report catalogue grouped by regulator
 *   POST   /generate     -- Generate a report by type
 *   GET    /data-quality  -- Run data quality checks
 *   POST   /ad-hoc       -- Execute ad-hoc query
 *   GET    /templates    -- List saved query templates
 *   POST   /templates    -- Save a query template
 */

import { Router } from 'express';
import { reportGeneratorService } from '../../services/report-generator-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

/** Whitelist of allowed tables for ad-hoc queries */
const ALLOWED_AD_HOC_TABLES = [
  'clients',
  'portfolios',
  'securities',
  'orders',
  'positions',
  'transactions',
  'nav_records',
  'fee_billing',
];

// =============================================================================
// Report Catalogue
// =============================================================================

/** GET /catalogue -- List all available reports grouped by regulator */
router.get(
  '/catalogue',
  asyncHandler(async (_req, res) => {
    const catalogue = reportGeneratorService.getCatalogue();
    res.json({ data: catalogue });
  }),
);

// =============================================================================
// Report Generation
// =============================================================================

/** POST /generate -- Generate a report by type */
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { reportType, params } = req.body;

    if (!reportType || typeof reportType !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'reportType is required and must be a string',
        },
      });
    }

    // Validate reportType exists in catalogue
    const catalogue = reportGeneratorService.getCatalogue();
    const allReportTypes = catalogue.regulators.flatMap((r) =>
      r.reports.map((rpt) => rpt.type),
    );

    if (!allReportTypes.includes(reportType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REPORT_TYPE',
          message: `Unknown report type '${reportType}'. Valid types: ${allReportTypes.join(', ')}`,
        },
      });
    }

    const reportParams = params ?? {};

    // Validate date formats if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (reportParams.dateFrom && !dateRegex.test(reportParams.dateFrom)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'dateFrom must be in YYYY-MM-DD format',
        },
      });
    }
    if (reportParams.dateTo && !dateRegex.test(reportParams.dateTo)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'dateTo must be in YYYY-MM-DD format',
        },
      });
    }
    if (reportParams.quarter && !/^\d{4}-Q[1-4]$/.test(reportParams.quarter)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'quarter must be in YYYY-Q[1-4] format (e.g. 2026-Q1)',
        },
      });
    }

    const result = await reportGeneratorService.generateReport(reportType, reportParams);
    res.json({ data: result });
  }),
);

// =============================================================================
// Data Quality
// =============================================================================

/** GET /data-quality -- Run data quality checks across all domains */
router.get(
  '/data-quality',
  asyncHandler(async (_req, res) => {
    const result = await reportGeneratorService.runDataQualityChecks();
    res.json({ data: result });
  }),
);

// =============================================================================
// Ad-Hoc Query
// =============================================================================

/** POST /ad-hoc -- Execute an ad-hoc query against whitelisted tables */
router.post(
  '/ad-hoc',
  asyncHandler(async (req, res) => {
    const { tableName, columns, filters, sortBy, sortDir, limit } = req.body;

    // Validate required fields
    if (!tableName || typeof tableName !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'tableName is required and must be a string',
        },
      });
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'columns is required and must be a non-empty array of strings',
        },
      });
    }

    // Whitelist validation at the route level
    if (!ALLOWED_AD_HOC_TABLES.includes(tableName)) {
      return res.status(403).json({
        error: {
          code: 'TABLE_NOT_ALLOWED',
          message: `Table '${tableName}' is not allowed for ad-hoc queries. Allowed: ${ALLOWED_AD_HOC_TABLES.join(', ')}`,
        },
      });
    }

    // Validate columns are strings
    for (const col of columns) {
      if (typeof col !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Each column must be a string',
          },
        });
      }
    }

    // Validate filters shape if provided
    if (filters && !Array.isArray(filters)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'filters must be an array of { column, operator, value } objects',
        },
      });
    }

    if (filters) {
      for (const f of filters) {
        if (!f.column || !f.operator) {
          return res.status(400).json({
            error: {
              code: 'INVALID_INPUT',
              message: 'Each filter must have column and operator fields',
            },
          });
        }

        const validOperators = ['eq', 'gte', 'lte', 'lt', 'like', 'isNull'];
        if (!validOperators.includes(f.operator)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_INPUT',
              message: `Invalid filter operator '${f.operator}'. Valid: ${validOperators.join(', ')}`,
            },
          });
        }
      }
    }

    // Validate sortDir
    if (sortDir && !['asc', 'desc'].includes(sortDir.toLowerCase())) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: "sortDir must be 'asc' or 'desc'",
        },
      });
    }

    // Validate limit
    if (limit !== undefined && (typeof limit !== 'number' || limit < 1)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'limit must be a positive number',
        },
      });
    }

    const result = await reportGeneratorService.executeAdHocQuery({
      tableName,
      columns,
      filters,
      sortBy,
      sortDir,
      limit,
    });

    res.json({ data: result });
  }),
);

// =============================================================================
// Query Templates
// =============================================================================

/** GET /templates -- List saved query templates */
router.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const templates = reportGeneratorService.getSavedTemplates();
    res.json({ data: templates });
  }),
);

/** POST /templates -- Save a query template */
router.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const { name, config } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'name is required and must be a non-empty string',
        },
      });
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'config is required and must be an object',
        },
      });
    }

    // If config includes a tableName, validate it is in whitelist
    if (config.tableName && !ALLOWED_AD_HOC_TABLES.includes(config.tableName)) {
      return res.status(403).json({
        error: {
          code: 'TABLE_NOT_ALLOWED',
          message: `Table '${config.tableName}' is not allowed. Allowed: ${ALLOWED_AD_HOC_TABLES.join(', ')}`,
        },
      });
    }

    const template = reportGeneratorService.saveTemplate(name.trim(), config);
    res.status(201).json({ data: template });
  }),
);

export default router;
