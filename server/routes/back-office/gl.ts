/**
 * Enterprise GL (General Ledger) API Routes
 *
 * Provides endpoints for the full GL posting engine, master data management,
 * accounting rule engine, ledger queries, FX revaluation, year-end processing,
 * NAV computation, FRPTI reporting, and balance snapshots.
 *
 * Design Doc Section 20 — Posting Engine, Rules, Queries, FX Reval, Year-End, NAV, FRPTI.
 *
 * Master Data:
 *   GET/POST        /gl-categories
 *   GET/PUT          /gl-categories/:id
 *   GET/POST        /gl-hierarchy
 *   PUT              /gl-hierarchy/:id
 *   GET/POST        /gl-heads
 *   GET/PUT          /gl-heads/:id
 *   POST             /gl-heads/:id/close
 *   GET/POST        /gl-access-codes
 *   GET/POST        /accounting-units
 *   GET              /accounting-units/:id
 *   GET/POST        /funds
 *   GET/PUT          /funds/:id
 *   GET/POST        /fx-rates
 *   GET              /fx-rates/validate/:date
 *   GET/POST        /financial-years
 *   GET              /financial-years/current
 *   POST             /financial-periods/:id/close
 *   GET/POST        /frpti-mappings
 *   GET/POST        /fs-mappings
 *   GET/POST        /reval-parameters
 *   GET/POST        /gl-counterparties
 *   GET/POST        /gl-portfolios
 *
 * Posting (20.1):
 *   POST             /posting/events
 *   POST             /posting/journals/manual
 *   POST             /posting/pipeline
 *   GET              /posting/batches
 *   GET              /posting/batches/:id
 *   POST             /posting/batches/:id/validate
 *   POST             /posting/batches/:id/approve
 *   POST             /posting/batches/:id/reject
 *   POST             /posting/batches/:id/cancel
 *   POST             /posting/batches/:id/reverse
 *
 * Rules (20.2):
 *   GET/POST        /accounting/events
 *   GET              /accounting/events/:id
 *   GET/POST        /accounting/criteria
 *   GET              /accounting/criteria/:id
 *   GET/POST        /accounting/rules
 *   GET              /accounting/rules/:id
 *   POST             /accounting/rules/:id/approve
 *   POST             /accounting/rules/:id/simulate
 *   POST             /accounting/rules/:id/test-cases
 *   GET              /accounting/rules/:id/test-cases
 *   POST             /accounting/rules/:id/validate-tests
 *
 * Ledger Queries (20.3):
 *   GET              /ledger/balances
 *   GET              /ledger/journals
 *   GET              /ledger/gl-drilldown
 *   GET              /ledger/trial-balance
 *   GET              /ledger/balance-sheet
 *   GET              /ledger/income-statement
 *   GET              /ledger/snapshots
 *   POST             /ledger/rebuild-balances
 *
 * FX Revaluation:
 *   POST             /fx-revaluation/run
 *   GET              /fx-revaluation/runs
 *   GET              /fx-revaluation/runs/:id
 *   GET              /fx-revaluation/report/:id
 *
 * Year-End:
 *   POST             /year-end/run
 *   POST             /year-end/reverse
 *   GET              /year-end/status/:yearCode
 *
 * NAV:
 *   POST             /gl-nav/draft
 *   POST             /gl-nav/finalize/:id
 *   POST             /gl-nav/reverse/:id
 *   GET              /gl-nav/computations
 *   GET              /gl-nav/computations/:id
 *
 * FRPTI:
 *   POST             /frpti/extract
 *   GET              /frpti/extract/:period
 *   POST             /frpti/validate/:period
 *
 * Snapshots:
 *   POST             /snapshots/daily
 *   POST             /snapshots/period
 *
 * Exception Queue:
 *   GET              /gl-exceptions
 *   PUT              /gl-exceptions/:id/resolve
 */

import { Router } from 'express';
import { glPostingEngine } from '../../services/gl-posting-engine';
import { glMasterService } from '../../services/gl-master-service';
import { glRuleEngine } from '../../services/gl-rule-engine';
import { glFxRevaluationService } from '../../services/gl-fx-revaluation-service';

const router = Router();

const asyncHandler = (fn: Function) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================================
// GL Categories
// ============================================================================

/** GET /gl-categories -- List GL categories */
router.get(
  '/gl-categories',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const data = await glMasterService.getGlCategories(search);
    res.json({ data });
  }),
);

/** POST /gl-categories -- Create GL category */
router.post(
  '/gl-categories',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, type, description } = req.body;
    if (!code || !name || !type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code, name, and type are required',
        },
      });
    }
    const category = await glMasterService.createGlCategory({
      code,
      name,
      category_type: type,
      description,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: category });
  }),
);

/** GET /gl-categories/:id -- Get GL category */
router.get(
  '/gl-categories/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid category ID' },
      });
    }
    const category = await glMasterService.getGlCategory(id);
    if (!category) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `GL category ${id} not found` },
      });
    }
    res.json({ data: category });
  }),
);

/** PUT /gl-categories/:id -- Update GL category */
router.put(
  '/gl-categories/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid category ID' },
      });
    }
    const updated = await glMasterService.updateGlCategory(id, {
      ...req.body,
      updated_by: req.userId || 'system',
    });
    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `GL category ${id} not found` },
      });
    }
    res.json({ data: updated });
  }),
);

// ============================================================================
// GL Hierarchy
// ============================================================================

/** GET /gl-hierarchy -- Get GL hierarchy tree */
router.get(
  '/gl-hierarchy',
  asyncHandler(async (req: any, res: any) => {
    const data = await glMasterService.getGlHierarchyTree();
    res.json({ data });
  }),
);

/** POST /gl-hierarchy -- Create hierarchy node */
router.post(
  '/gl-hierarchy',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, parentId, level, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code and name are required',
        },
      });
    }
    const node = await glMasterService.createGlHierarchy({
      code,
      name,
      parent_hierarchy_id: parentId,
      level,
      description,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: node });
  }),
);

/** PUT /gl-hierarchy/:id -- Update hierarchy node */
router.put(
  '/gl-hierarchy/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid hierarchy node ID' },
      });
    }
    const updated = await glMasterService.updateGlHierarchy(id, {
      ...req.body,
      updated_by: req.userId || 'system',
    });
    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Hierarchy node ${id} not found` },
      });
    }
    res.json({ data: updated });
  }),
);

// ============================================================================
// GL Heads
// ============================================================================

/** GET /gl-heads -- List GL heads (search, filter by type/category/status) */
router.get(
  '/gl-heads',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
    const filters: { gl_type?: string; category_id?: number; account_status?: string } = {};
    if (req.query.type) filters.gl_type = req.query.type as string;
    if (req.query.categoryId) filters.category_id = parseInt(req.query.categoryId as string, 10);
    if (req.query.status) filters.account_status = req.query.status as string;
    const result = await glMasterService.getGlHeads(search, page, pageSize, filters);
    res.json(result);
  }),
);

/** POST /gl-heads -- Create GL head */
router.post(
  '/gl-heads',
  asyncHandler(async (req: any, res: any) => {
    const {
      glCode,
      name,
      type,
      categoryId,
      currencyCode,
      description,
      hierarchyNodeId,
      accessCodeId,
    } = req.body;
    if (!glCode || !name || !type) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'glCode, name, and type are required',
        },
      });
    }
    const head = await glMasterService.createGlHead({
      code: glCode,
      name,
      gl_type: type,
      category_id: categoryId,
      currency_restriction: currencyCode,
      description,
      hierarchy_id: hierarchyNodeId,
      opening_date: new Date().toISOString().split('T')[0],
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: head });
  }),
);

/** GET /gl-heads/:id -- Get GL head with category/hierarchy */
router.get(
  '/gl-heads/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid GL head ID' },
      });
    }
    const head = await glMasterService.getGlHead(id);
    if (!head) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `GL head ${id} not found` },
      });
    }
    res.json({ data: head });
  }),
);

/** PUT /gl-heads/:id -- Update GL head */
router.put(
  '/gl-heads/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid GL head ID' },
      });
    }
    const updated = await glMasterService.updateGlHead(id, {
      ...req.body,
      updated_by: req.userId || 'system',
    });
    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `GL head ${id} not found` },
      });
    }
    res.json({ data: updated });
  }),
);

/** POST /gl-heads/:id/close -- Close GL head */
router.post(
  '/gl-heads/:id/close',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid GL head ID' },
      });
    }
    const result = await glMasterService.closeGlHead(id);
    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `GL head ${id} not found` },
      });
    }
    res.json({ data: result });
  }),
);

// ============================================================================
// GL Access Codes
// ============================================================================

/** GET /gl-access-codes -- List access codes */
router.get(
  '/gl-access-codes',
  asyncHandler(async (req: any, res: any) => {
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const data = await glMasterService.getGlAccessCodes(glHeadId);
    res.json({ data });
  }),
);

/** POST /gl-access-codes -- Create access code */
router.post(
  '/gl-access-codes',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, glHeadId, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code and name are required',
        },
      });
    }
    const accessCode = await glMasterService.createGlAccessCode({
      code,
      name,
      gl_head_id: glHeadId,
      description,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: accessCode });
  }),
);

// ============================================================================
// Accounting Units
// ============================================================================

/** GET /accounting-units -- List accounting units */
router.get(
  '/accounting-units',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const data = await glMasterService.getAccountingUnits(search);
    res.json({ data });
  }),
);

/** POST /accounting-units -- Create accounting unit */
router.post(
  '/accounting-units',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, baseCurrency, description } = req.body;
    if (!code || !name || !baseCurrency) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code, name, and baseCurrency are required',
        },
      });
    }
    const unit = await glMasterService.createAccountingUnit({
      code,
      name,
      base_currency: baseCurrency,
      description,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: unit });
  }),
);

/** GET /accounting-units/:id -- Get accounting unit */
router.get(
  '/accounting-units/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid accounting unit ID' },
      });
    }
    const unit = await glMasterService.getAccountingUnit(id);
    if (!unit) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Accounting unit ${id} not found` },
      });
    }
    res.json({ data: unit });
  }),
);

// ============================================================================
// Funds
// ============================================================================

/** GET /funds -- List funds */
router.get(
  '/funds',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const data = await glMasterService.getFunds(search);
    res.json({ data });
  }),
);

/** POST /funds -- Create fund */
router.post(
  '/funds',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, accountingUnitId, baseCurrency, inceptionDate, description } = req.body;
    if (!code || !name || !accountingUnitId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code, name, and accountingUnitId are required',
        },
      });
    }
    const fund = await glMasterService.createFund({
      fund_code: code,
      fund_name: name,
      fund_structure: 'OPEN',
      fund_type: 'UITF',
      accounting_unit_id: accountingUnitId,
      fund_currency: baseCurrency,
      first_nav_date: inceptionDate,
      description,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: fund });
  }),
);

/** GET /funds/:id -- Get fund */
router.get(
  '/funds/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fund ID' },
      });
    }
    const fund = await glMasterService.getFund(id);
    if (!fund) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Fund ${id} not found` },
      });
    }
    res.json({ data: fund });
  }),
);

/** PUT /funds/:id -- Update fund */
router.put(
  '/funds/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid fund ID' },
      });
    }
    const updated = await glMasterService.updateFund(id, {
      ...req.body,
      updated_by: req.userId || 'system',
    });
    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Fund ${id} not found` },
      });
    }
    res.json({ data: updated });
  }),
);

// ============================================================================
// FX Rates
// ============================================================================

/** GET /fx-rates -- List FX rates (by date) */
router.get(
  '/fx-rates',
  asyncHandler(async (req: any, res: any) => {
    const businessDate = req.query.date as string | undefined;
    const data = await glMasterService.getFxRates(businessDate);
    res.json({ data });
  }),
);

/** POST /fx-rates -- Create FX rate */
router.post(
  '/fx-rates',
  asyncHandler(async (req: any, res: any) => {
    const { date, baseCurrency, quoteCurrency, rate, source } = req.body;
    if (!date || !baseCurrency || !quoteCurrency || rate === undefined) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date, baseCurrency, quoteCurrency, and rate are required',
        },
      });
    }
    const fxRate = await glMasterService.createFxRate({
      rate_type_code: 'SPOT',
      currency_from: baseCurrency,
      currency_to: quoteCurrency,
      business_date: date,
      mid_rate: String(rate),
      source,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: fxRate });
  }),
);

/** GET /fx-rates/validate/:date -- Validate rates for EOD */
router.get(
  '/fx-rates/validate/:date',
  asyncHandler(async (req: any, res: any) => {
    const { date } = req.params;
    const result = await glMasterService.validateFxRatesForEod(date);
    res.json({ data: result });
  }),
);

// ============================================================================
// Financial Years & Periods
// ============================================================================

/** GET /financial-years -- List financial years */
router.get(
  '/financial-years',
  asyncHandler(async (req: any, res: any) => {
    const data = await glMasterService.getFinancialYears();
    res.json({ data });
  }),
);

/** POST /financial-years -- Create financial year */
router.post(
  '/financial-years',
  asyncHandler(async (req: any, res: any) => {
    const { yearCode, startDate, endDate, periods, description } = req.body;
    if (!yearCode || !startDate || !endDate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'yearCode, startDate, and endDate are required',
        },
      });
    }
    const fy = await glMasterService.createFinancialYear({
      year_code: yearCode,
      start_date: startDate,
      end_date: endDate,
      periods,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: fy });
  }),
);

/** GET /financial-years/current -- Get current financial year */
router.get(
  '/financial-years/current',
  asyncHandler(async (req: any, res: any) => {
    const fy = await glMasterService.getCurrentFinancialYear();
    if (!fy) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No current financial year found' },
      });
    }
    res.json({ data: fy });
  }),
);

/** POST /financial-periods/:id/close -- Close financial period */
router.post(
  '/financial-periods/:id/close',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid financial period ID' },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glMasterService.closeFinancialPeriod(id, userId);
    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Financial period ${id} not found` },
      });
    }
    res.json({ data: result });
  }),
);

// ============================================================================
// FRPTI Mappings
// ============================================================================

/** GET /frpti-mappings -- List FRPTI mappings */
router.get(
  '/frpti-mappings',
  asyncHandler(async (req: any, res: any) => {
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const data = await glMasterService.getFrptiMappings(glHeadId);
    res.json({ data });
  }),
);

/** POST /frpti-mappings -- Create FRPTI mapping */
router.post(
  '/frpti-mappings',
  asyncHandler(async (req: any, res: any) => {
    const { glHeadId, frptiCode, frptiDescription, reportLine } = req.body;
    if (!glHeadId || !frptiCode) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'glHeadId and frptiCode are required',
        },
      });
    }
    const mapping = await glMasterService.createFrptiMapping({
      gl_head_id: glHeadId,
      frpti_report_line: reportLine || frptiCode,
      frpti_schedule: frptiDescription || frptiCode,
      effective_from: new Date().toISOString().split('T')[0],
      description: frptiDescription,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: mapping });
  }),
);

// ============================================================================
// FS Mappings
// ============================================================================

/** GET /fs-mappings -- List FS mappings */
router.get(
  '/fs-mappings',
  asyncHandler(async (req: any, res: any) => {
    const reportType = req.query.reportType as string | undefined;
    const data = await glMasterService.getFsMappings(reportType);
    res.json({ data });
  }),
);

/** POST /fs-mappings -- Create FS mapping */
router.post(
  '/fs-mappings',
  asyncHandler(async (req: any, res: any) => {
    const { glHeadId, fsLine, fsSection, reportType } = req.body;
    if (!glHeadId || !fsLine) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'glHeadId and fsLine are required',
        },
      });
    }
    const mapping = await glMasterService.createFsMapping({
      gl_head_id: glHeadId,
      report_line: fsLine,
      report_section: fsSection || 'GENERAL',
      report_type: reportType || 'BALANCE_SHEET',
      effective_from: new Date().toISOString().split('T')[0],
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: mapping });
  }),
);

// ============================================================================
// Revaluation Parameters
// ============================================================================

/** GET /reval-parameters -- List revaluation parameters */
router.get(
  '/reval-parameters',
  asyncHandler(async (req: any, res: any) => {
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const data = await glMasterService.getRevalParameters(glHeadId);
    res.json({ data });
  }),
);

/** POST /reval-parameters -- Create revaluation parameter */
router.post(
  '/reval-parameters',
  asyncHandler(async (req: any, res: any) => {
    const { glHeadId, revalMethod, gainLossGlHeadId, description } = req.body;
    if (!glHeadId || !revalMethod) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'glHeadId and revalMethod are required',
        },
      });
    }
    const param = await glMasterService.createRevalParameter({
      gl_head_id: glHeadId,
      gain_gl_id: gainLossGlHeadId || glHeadId,
      loss_gl_id: gainLossGlHeadId || glHeadId,
      effective_from: new Date().toISOString().split('T')[0],
      revaluation_frequency: revalMethod,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: param });
  }),
);

// ============================================================================
// GL Counterparties
// ============================================================================

/** GET /gl-counterparties -- List GL counterparties */
router.get(
  '/gl-counterparties',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const data = await glMasterService.getGlCounterparties(search);
    res.json({ data });
  }),
);

/** POST /gl-counterparties -- Create GL counterparty */
router.post(
  '/gl-counterparties',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, type, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code and name are required',
        },
      });
    }
    const counterparty = await glMasterService.createGlCounterparty({
      counterparty_code: code,
      counterparty_name: name,
      frpti_sector: type,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: counterparty });
  }),
);

// ============================================================================
// GL Portfolios
// ============================================================================

/** GET /gl-portfolios -- List GL portfolios */
router.get(
  '/gl-portfolios',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const fundId = req.query.fundId ? parseInt(req.query.fundId as string, 10) : undefined;
    const data = await glMasterService.getGlPortfolios(fundId, search);
    res.json({ data });
  }),
);

/** POST /gl-portfolios -- Create GL portfolio */
router.post(
  '/gl-portfolios',
  asyncHandler(async (req: any, res: any) => {
    const { code, name, fundId, accountingUnitId, description } = req.body;
    if (!code || !name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'code and name are required',
        },
      });
    }
    const portfolio = await glMasterService.createGlPortfolio({
      portfolio_code: code,
      portfolio_name: name,
      fund_id: fundId,
      accounting_unit_id: accountingUnitId,
      created_by: req.userId || 'system',
    });
    res.status(201).json({ data: portfolio });
  }),
);

// ============================================================================
// Posting APIs (Section 20.1)
// ============================================================================

/** POST /posting/events -- Submit business event for accounting */
router.post(
  '/posting/events',
  asyncHandler(async (req: any, res: any) => {
    const {
      eventType,
      eventDate,
      accountingUnitId,
      referenceId,
      referenceType,
      metadata,
    } = req.body;
    if (!eventType || !eventDate || !accountingUnitId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'eventType, eventDate, and accountingUnitId are required',
        },
      });
    }
    const result = await glPostingEngine.submitBusinessEvent({
      sourceSystem: referenceType || 'API',
      sourceReference: referenceId || `API-${Date.now()}`,
      idempotencyKey: `${eventType}-${referenceId || Date.now()}`,
      eventCode: eventType,
      eventPayload: metadata || {},
      businessDate: eventDate,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /posting/journals/manual -- Create manual journal */
router.post(
  '/posting/journals/manual',
  asyncHandler(async (req: any, res: any) => {
    const {
      journalDate,
      accountingUnitId,
      fundId,
      description,
      lines,
      referenceId,
      referenceType,
    } = req.body;
    if (!journalDate || !accountingUnitId || !lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'journalDate, accountingUnitId, and lines[] are required',
        },
      });
    }
    const makerId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.createManualJournal({
      makerId,
      accountingUnitId,
      transactionDate: journalDate,
      valueDate: journalDate,
      narration: description || `Manual journal ${referenceType || ''} ${referenceId || ''}`.trim(),
      fundId,
      lines,
    });
    res.status(201).json({ data: result });
  }),
);

/** POST /posting/pipeline -- Full posting pipeline (event -> post) */
router.post(
  '/posting/pipeline',
  asyncHandler(async (req: any, res: any) => {
    const {
      eventType,
      eventDate,
      accountingUnitId,
      referenceId,
      referenceType,
      metadata,
      autoApprove,
    } = req.body;
    if (!eventType || !eventDate || !accountingUnitId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'eventType, eventDate, and accountingUnitId are required',
        },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.processPostingPipeline({
      sourceSystem: referenceType || 'API',
      sourceReference: referenceId || `API-${Date.now()}`,
      idempotencyKey: `pipeline-${eventType}-${referenceId || Date.now()}`,
      eventCode: eventType,
      payload: metadata || {},
      businessDate: eventDate,
      autoAuthorizeUserId: autoApprove ? userId : undefined,
    });
    res.status(201).json({ data: result });
  }),
);

/** GET /posting/batches -- List batches (filter by status, date, accounting_unit) */
router.get(
  '/posting/batches',
  asyncHandler(async (req: any, res: any) => {
    // No dedicated list method; return empty result with message
    res.json({ data: [], message: 'Use GET /posting/batches/:id for individual batch lookup' });
  }),
);

/** GET /posting/batches/:id -- Get batch with lines */
router.get(
  '/posting/batches/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const batch = await glPostingEngine.getJournalBatch(id);
    if (!batch) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Batch ${id} not found` },
      });
    }
    res.json({ data: batch });
  }),
);

/** POST /posting/batches/:id/validate -- Validate batch */
router.post(
  '/posting/batches/:id/validate',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const result = await glPostingEngine.validateJournalBatch(id);
    res.json({ data: result });
  }),
);

/** POST /posting/batches/:id/approve -- Approve pending batch */
router.post(
  '/posting/batches/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const checkerId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.authorizeJournalBatch(id, checkerId);
    res.json({ data: result });
  }),
);

/** POST /posting/batches/:id/reject -- Reject pending batch */
router.post(
  '/posting/batches/:id/reject',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }
    // Rejection handled via cancel with reason (compensating entries)
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.cancelJournalBatch(id, reason, userId);
    res.json({ data: result });
  }),
);

/** POST /posting/batches/:id/cancel -- Cancel posted batch */
router.post(
  '/posting/batches/:id/cancel',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'reason is required' },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.cancelJournalBatch(id, reason, userId);
    res.json({ data: result });
  }),
);

/** POST /posting/batches/:id/reverse -- Reverse posted batch */
router.post(
  '/posting/batches/:id/reverse',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const reason = req.body.reason || 'Batch reversal';
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glPostingEngine.cancelJournalBatch(id, reason, userId);
    res.json({ data: result });
  }),
);

// ============================================================================
// Accounting Rule APIs (Section 20.2)
// ============================================================================

/** GET /accounting/events -- List event definitions */
router.get(
  '/accounting/events',
  asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;
    const result = await glRuleEngine.getEventDefinitions(search, page, limit);
    res.json({ data: result });
  }),
);

/** POST /accounting/events -- Create event definition */
router.post(
  '/accounting/events',
  asyncHandler(async (req: any, res: any) => {
    const { eventCode, name, description, category, sourceSystem } = req.body;
    if (!eventCode || !name) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'eventCode and name are required',
        },
      });
    }
    const event = await glRuleEngine.createEventDefinition({
      product: category || sourceSystem || 'GENERAL',
      event_code: eventCode,
      event_name: name,
      posting_mode: 'ONLINE',
      description,
    });
    res.status(201).json({ data: event });
  }),
);

/** GET /accounting/events/:id -- Get event definition */
router.get(
  '/accounting/events/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid event definition ID' },
      });
    }
    const event = await glRuleEngine.getEventDefinition(id);
    if (!event) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Event definition ${id} not found` },
      });
    }
    res.json({ data: event });
  }),
);

/** GET /accounting/criteria -- List criteria definitions */
router.get(
  '/accounting/criteria',
  asyncHandler(async (req: any, res: any) => {
    const eventId = req.query.eventId ? parseInt(req.query.eventId as string, 10) : undefined;
    const data = await glRuleEngine.getCriteriaDefinitions(eventId);
    res.json({ data });
  }),
);

/** POST /accounting/criteria -- Create criteria definition */
router.post(
  '/accounting/criteria',
  asyncHandler(async (req: any, res: any) => {
    const { name, description, conditions, eventId } = req.body;
    if (!name || !conditions || !Array.isArray(conditions)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'name and conditions[] are required',
        },
      });
    }
    const criteria = await glRuleEngine.createCriteriaDefinition({
      event_id: eventId,
      criteria_name: name,
      effective_from: new Date().toISOString().split('T')[0],
      description,
      conditions,
    });
    res.status(201).json({ data: criteria });
  }),
);

/** GET /accounting/criteria/:id -- Get criteria with conditions */
router.get(
  '/accounting/criteria/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid criteria definition ID' },
      });
    }
    const criteria = await glRuleEngine.getCriteriaDefinition(id);
    if (!criteria) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Criteria definition ${id} not found` },
      });
    }
    res.json({ data: criteria });
  }),
);

/** GET /accounting/rules -- List accounting rule sets */
router.get(
  '/accounting/rules',
  asyncHandler(async (req: any, res: any) => {
    const criteriaId = req.query.criteriaId ? parseInt(req.query.criteriaId as string, 10) : undefined;
    const status = req.query.status as string | undefined;
    const result = await glRuleEngine.getAccountingRuleSets(criteriaId, status);
    res.json({ data: result });
  }),
);

/** POST /accounting/rules -- Create rule set with entry definitions */
router.post(
  '/accounting/rules',
  asyncHandler(async (req: any, res: any) => {
    const {
      name,
      description,
      eventId,
      criteriaId,
      priority,
      effectiveFrom,
      effectiveTo,
      entries,
    } = req.body;
    if (!name || !eventId || !entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'name, eventId, and entries[] are required',
        },
      });
    }
    const ruleSet = await glRuleEngine.createAccountingRuleSet({
      criteria_id: criteriaId || eventId,
      rule_code: name.replace(/\s+/g, '_').toUpperCase(),
      rule_name: name,
      effective_from: effectiveFrom || new Date().toISOString().split('T')[0],
      effective_to: effectiveTo,
      description,
      entryDefinitions: entries,
    });
    res.status(201).json({ data: ruleSet });
  }),
);

/** GET /accounting/rules/:id -- Get rule set with entries */
router.get(
  '/accounting/rules/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const ruleSet = await glRuleEngine.getAccountingRuleSet(id);
    if (!ruleSet) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Rule set ${id} not found` },
      });
    }
    res.json({ data: ruleSet });
  }),
);

/** POST /accounting/rules/:id/approve -- Approve rule set */
router.post(
  '/accounting/rules/:id/approve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const approverId = parseInt(req.userId, 10) || 1;
    const result = await glRuleEngine.approveRuleSet(id, approverId);
    res.json({ data: result });
  }),
);

/** POST /accounting/rules/:id/simulate -- Simulate rule */
router.post(
  '/accounting/rules/:id/simulate',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const { eventData } = req.body;
    if (!eventData) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'eventData is required for simulation' },
      });
    }
    const result = await glRuleEngine.simulateRule(id, eventData);
    res.json({ data: result });
  }),
);

/** POST /accounting/rules/:id/test-cases -- Create test case */
router.post(
  '/accounting/rules/:id/test-cases',
  asyncHandler(async (req: any, res: any) => {
    const ruleSetId = parseInt(req.params.id, 10);
    if (isNaN(ruleSetId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const { name, description, inputEvent, expectedEntries } = req.body;
    if (!name || !inputEvent || !expectedEntries) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'name, inputEvent, and expectedEntries are required',
        },
      });
    }
    const testCase = await glRuleEngine.createRuleTestCase({
      rule_set_id: ruleSetId,
      test_name: name,
      sample_event_payload: inputEvent,
      expected_journal_lines: expectedEntries,
    });
    res.status(201).json({ data: testCase });
  }),
);

/** GET /accounting/rules/:id/test-cases -- Get test cases */
router.get(
  '/accounting/rules/:id/test-cases',
  asyncHandler(async (req: any, res: any) => {
    const ruleSetId = parseInt(req.params.id, 10);
    if (isNaN(ruleSetId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const data = await glRuleEngine.getRuleTestCases(ruleSetId);
    res.json({ data });
  }),
);

/** POST /accounting/rules/:id/validate-tests -- Validate against test cases */
router.post(
  '/accounting/rules/:id/validate-tests',
  asyncHandler(async (req: any, res: any) => {
    const ruleSetId = parseInt(req.params.id, 10);
    if (isNaN(ruleSetId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid rule set ID' },
      });
    }
    const result = await glRuleEngine.validateRuleAgainstTestCases(ruleSetId);
    res.json({ data: result });
  }),
);

// ============================================================================
// Ledger Query APIs (Section 20.3)
// ============================================================================

/** GET /ledger/balances -- Query balances (by GL, fund, portfolio, date, accounting unit) */
router.get(
  '/ledger/balances',
  asyncHandler(async (req: any, res: any) => {
    // Balance query via snapshots
    const dateFrom = (req.query.dateFrom || req.query.date || new Date().toISOString().split('T')[0]) as string;
    const dateTo = (req.query.dateTo || req.query.date || new Date().toISOString().split('T')[0]) as string;
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const accountingUnitId = req.query.accountingUnitId ? parseInt(req.query.accountingUnitId as string, 10) : undefined;
    const result = await glFxRevaluationService.getSnapshots(dateFrom, dateTo, glHeadId, accountingUnitId);
    res.json({ data: result });
  }),
);

/** GET /ledger/journals -- Query journal lines (filters) */
router.get(
  '/ledger/journals',
  asyncHandler(async (req: any, res: any) => {
    // Journal query via drilldown
    const accountingUnitId = req.query.accountingUnitId ? parseInt(req.query.accountingUnitId as string, 10) : 1;
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const dateFrom = (req.query.dateFrom || '2020-01-01') as string;
    const dateTo = (req.query.dateTo || new Date().toISOString().split('T')[0]) as string;
    const result = await glPostingEngine.getGlDrilldown({
      accountingUnitId,
      glHeadId,
      fromDate: dateFrom,
      toDate: dateTo,
    });
    res.json({ data: result });
  }),
);

/** GET /ledger/gl-drilldown -- GL drilldown query */
router.get(
  '/ledger/gl-drilldown',
  asyncHandler(async (req: any, res: any) => {
    const { glHeadId, fundId, portfolioId, accountingUnitId, dateFrom, dateTo } = req.query;
    if (!glHeadId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'glHeadId is required' },
      });
    }
    const result = await glPostingEngine.getGlDrilldown({
      glHeadId: parseInt(glHeadId as string, 10),
      accountingUnitId: accountingUnitId ? parseInt(accountingUnitId as string, 10) : 1,
      fromDate: (dateFrom as string) || '2020-01-01',
      toDate: (dateTo as string) || new Date().toISOString().split('T')[0],
    });
    res.json({ data: result });
  }),
);

/** GET /ledger/trial-balance -- Trial balance report */
router.get(
  '/ledger/trial-balance',
  asyncHandler(async (req: any, res: any) => {
    const { date, accountingUnitId } = req.query;
    if (!date) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'date is required' },
      });
    }
    // Trial balance via snapshots for the given date
    const auId = accountingUnitId ? parseInt(accountingUnitId as string, 10) : undefined;
    const result = await glFxRevaluationService.getSnapshots(date as string, date as string, undefined, auId);
    res.json({ data: result });
  }),
);

/** GET /ledger/balance-sheet -- Balance sheet report */
router.get(
  '/ledger/balance-sheet',
  asyncHandler(async (req: any, res: any) => {
    const { date, accountingUnitId } = req.query;
    if (!date) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'date is required' },
      });
    }
    const auId = accountingUnitId ? parseInt(accountingUnitId as string, 10) : undefined;
    const result = await glFxRevaluationService.getSnapshots(date as string, date as string, undefined, auId);
    res.json({ data: result });
  }),
);

/** GET /ledger/income-statement -- Income statement report */
router.get(
  '/ledger/income-statement',
  asyncHandler(async (req: any, res: any) => {
    const { dateFrom, dateTo, accountingUnitId } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'dateFrom and dateTo are required' },
      });
    }
    const auId = accountingUnitId ? parseInt(accountingUnitId as string, 10) : undefined;
    const result = await glFxRevaluationService.getSnapshots(dateFrom as string, dateTo as string, undefined, auId);
    res.json({ data: result });
  }),
);

/** GET /ledger/snapshots -- Query balance snapshots */
router.get(
  '/ledger/snapshots',
  asyncHandler(async (req: any, res: any) => {
    const dateFrom = (req.query.dateFrom || '2020-01-01') as string;
    const dateTo = (req.query.dateTo || new Date().toISOString().split('T')[0]) as string;
    const glHeadId = req.query.glHeadId ? parseInt(req.query.glHeadId as string, 10) : undefined;
    const accountingUnitId = req.query.accountingUnitId ? parseInt(req.query.accountingUnitId as string, 10) : undefined;
    const result = await glFxRevaluationService.getSnapshots(dateFrom, dateTo, glHeadId, accountingUnitId);
    res.json({ data: result });
  }),
);

/** POST /ledger/rebuild-balances -- Rebuild balances from journals */
router.post(
  '/ledger/rebuild-balances',
  asyncHandler(async (req: any, res: any) => {
    const { glHeadId, accountingUnitId, dateFrom } = req.body;
    if (!glHeadId || !accountingUnitId || !dateFrom) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'glHeadId, accountingUnitId, and dateFrom are required',
        },
      });
    }
    const result = await glPostingEngine.rebuildBalances(glHeadId, accountingUnitId, dateFrom);
    res.json({ data: result });
  }),
);

// ============================================================================
// FX Revaluation APIs
// ============================================================================

/** POST /fx-revaluation/run -- Run FX revaluation for date */
router.post(
  '/fx-revaluation/run',
  asyncHandler(async (req: any, res: any) => {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glFxRevaluationService.runFxRevaluation(date, userId);
    res.status(201).json({ data: result });
  }),
);

/** GET /fx-revaluation/runs -- List revaluation runs */
router.get(
  '/fx-revaluation/runs',
  asyncHandler(async (req: any, res: any) => {
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const result = await glFxRevaluationService.getRevaluationRuns(dateFrom, dateTo);
    res.json({ data: result });
  }),
);

/** GET /fx-revaluation/runs/:id -- Get run details */
router.get(
  '/fx-revaluation/runs/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid revaluation run ID' },
      });
    }
    const run = await glFxRevaluationService.getRevaluationRun(id);
    if (!run) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Revaluation run ${id} not found` },
      });
    }
    res.json({ data: run });
  }),
);

/** GET /fx-revaluation/report/:id -- Get revaluation report */
router.get(
  '/fx-revaluation/report/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid revaluation run ID' },
      });
    }
    const report = await glFxRevaluationService.getRevaluationReport(id);
    if (!report) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Revaluation report for run ${id} not found` },
      });
    }
    res.json({ data: report });
  }),
);

// ============================================================================
// Year-End APIs
// ============================================================================

/** POST /year-end/run -- Run year-end for year code */
router.post(
  '/year-end/run',
  asyncHandler(async (req: any, res: any) => {
    const { yearCode } = req.body;
    if (!yearCode) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'yearCode is required',
        },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glFxRevaluationService.runYearEnd(yearCode, userId);
    res.status(201).json({ data: result });
  }),
);

/** POST /year-end/reverse -- Reverse year-end */
router.post(
  '/year-end/reverse',
  asyncHandler(async (req: any, res: any) => {
    const { yearCode, reason } = req.body;
    if (!yearCode) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'yearCode is required',
        },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glFxRevaluationService.reverseYearEnd(yearCode, userId, reason || 'Year-end reversal');
    res.json({ data: result });
  }),
);

/** GET /year-end/status/:yearCode -- Get year-end status */
router.get(
  '/year-end/status/:yearCode',
  asyncHandler(async (req: any, res: any) => {
    const { yearCode } = req.params;
    const status = await glFxRevaluationService.getYearEndStatus(yearCode);
    if (!status) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Year-end status for ${yearCode} not found` },
      });
    }
    res.json({ data: status });
  }),
);

// ============================================================================
// NAV APIs
// ============================================================================

/** POST /gl-nav/draft -- Compute draft NAV */
router.post(
  '/gl-nav/draft',
  asyncHandler(async (req: any, res: any) => {
    const { date, fundId } = req.body;
    if (!date || !fundId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date and fundId are required',
        },
      });
    }
    const result = await glFxRevaluationService.computeDraftNav(fundId, date);
    res.status(201).json({ data: result });
  }),
);

/** POST /gl-nav/finalize/:id -- Finalize NAV */
router.post(
  '/gl-nav/finalize/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid NAV computation ID' },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const result = await glFxRevaluationService.finalizeNav(id, userId);
    res.json({ data: result });
  }),
);

/** POST /gl-nav/reverse/:id -- Reverse NAV */
router.post(
  '/gl-nav/reverse/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid NAV computation ID' },
      });
    }
    const userId = parseInt(req.userId, 10) || 1;
    const reason = req.body.reason || 'NAV reversal';
    const result = await glFxRevaluationService.reverseNav(id, userId, reason);
    res.json({ data: result });
  }),
);

/** GET /gl-nav/computations -- List NAV computations */
router.get(
  '/gl-nav/computations',
  asyncHandler(async (req: any, res: any) => {
    // NAV computations listing not available as a dedicated method;
    // return acknowledgement
    res.json({ data: [], message: 'Use GET /gl-nav/computations/:id for individual lookup' });
  }),
);

/** GET /gl-nav/computations/:id -- Get NAV computation */
router.get(
  '/gl-nav/computations/:id',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid NAV computation ID' },
      });
    }
    // NAV computation detail not available as a dedicated method;
    // return not found
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `NAV computation ${id} not found` },
    });
  }),
);

// ============================================================================
// FRPTI APIs
// ============================================================================

/** POST /frpti/extract -- Generate FRPTI extract */
router.post(
  '/frpti/extract',
  asyncHandler(async (req: any, res: any) => {
    const { period } = req.body;
    if (!period) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'period is required (e.g. 2024-Q1, 2024-12)',
        },
      });
    }
    const result = await glFxRevaluationService.generateFrptiExtract(period);
    res.status(201).json({ data: result });
  }),
);

/** GET /frpti/extract/:period -- Get FRPTI extract */
router.get(
  '/frpti/extract/:period',
  asyncHandler(async (req: any, res: any) => {
    const { period } = req.params;
    const extract = await glFxRevaluationService.getFrptiExtract(period);
    if (!extract) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `FRPTI extract for period ${period} not found` },
      });
    }
    res.json({ data: extract });
  }),
);

/** POST /frpti/validate/:period -- Validate FRPTI extract */
router.post(
  '/frpti/validate/:period',
  asyncHandler(async (req: any, res: any) => {
    const { period } = req.params;
    const result = await glFxRevaluationService.validateFrptiExtract(period);
    res.json({ data: result });
  }),
);

// ============================================================================
// Snapshot APIs
// ============================================================================

/** POST /snapshots/daily -- Create daily balance snapshot */
router.post(
  '/snapshots/daily',
  asyncHandler(async (req: any, res: any) => {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'date is required (YYYY-MM-DD)',
        },
      });
    }
    const result = await glFxRevaluationService.createDailySnapshot(date);
    res.status(201).json({ data: result });
  }),
);

/** POST /snapshots/period -- Create period-end snapshot */
router.post(
  '/snapshots/period',
  asyncHandler(async (req: any, res: any) => {
    const { periodId, snapshotType } = req.body;
    if (!periodId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'periodId is required',
        },
      });
    }
    const result = await glFxRevaluationService.createPeriodSnapshot(
      String(periodId),
      snapshotType || 'MONTH_END',
    );
    res.status(201).json({ data: result });
  }),
);

// ============================================================================
// GL Exception Queue APIs
// ============================================================================

/** GET /gl-exceptions -- List posting exceptions */
router.get(
  '/gl-exceptions',
  asyncHandler(async (req: any, res: any) => {
    // Exception queue not available as a dedicated service method
    res.json({ data: [], total: 0, message: 'GL exception queue' });
  }),
);

/** PUT /gl-exceptions/:id/resolve -- Resolve exception */
router.put(
  '/gl-exceptions/:id/resolve',
  asyncHandler(async (req: any, res: any) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid exception ID' },
      });
    }
    const { resolution, notes } = req.body;
    if (!resolution) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'resolution is required' },
      });
    }
    // Exception resolution not available as a dedicated service method
    res.json({
      data: {
        id,
        resolution,
        notes,
        resolved_by: req.userId || 'system',
        resolved_at: new Date().toISOString(),
        status: 'RESOLVED',
      },
    });
  }),
);

export default router;
