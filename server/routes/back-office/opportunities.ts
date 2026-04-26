/**
 * Opportunity Pipeline Routes (CRM-OPP)
 *
 * Includes FR-017 bulk upload endpoint (P0-05):
 *   POST /bulk-upload  — Validate + insert CSV rows (max 500)
 *   GET  /upload-template — Download CSV template
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An error occurred';
}
import { opportunityService } from '../../services/opportunity-service';
import { requireCRMRole } from '../../middleware/role-auth';

const bulkUploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many bulk upload requests. Try again later.' } },
});

const router = Router();

// Get pipeline dashboard
router.get('/dashboard', requireCRMRole(), async (req, res) => {
  try {
    const data = await opportunityService.getPipelineDashboard();
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List opportunities
router.get('/', requireCRMRole(), async (req, res) => {
  try {
    const { stage, product_type, page, pageSize } = req.query;
    const data = await opportunityService.list({
      stage: stage as string,
      product_type: product_type as string,
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single opportunity
router.get('/:id', requireCRMRole(), async (req, res) => {
  try {
    const data = await opportunityService.getById(parseInt(req.params.id));
    res.json(data);
  } catch (err: unknown) {
    res.status(404).json({ error: errMsg(err) });
  }
});

// Create opportunity
router.post('/', requireCRMRole(), async (req, res) => {
  try {
    const data = await opportunityService.create(req.body);
    res.status(201).json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// Update opportunity
router.patch('/:id', requireCRMRole(), async (req, res) => {
  try {
    const data = await opportunityService.update(parseInt(req.params.id), req.body);
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// Update stage
router.post('/:id/stage', requireCRMRole(), async (req, res) => {
  try {
    const { stage, loss_reason } = req.body;
    const data = await opportunityService.updateStage(parseInt(req.params.id), stage, loss_reason);
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ error: errMsg(err) });
  }
});

// ── FR-017: Bulk Upload Opportunities (P0-05) ─────────────────────────────────

const VALID_PRODUCT_TYPES = [
  'IMA_DIRECTED', 'IMA_DISCRETIONARY', 'UITF', 'PMT', 'PRE_NEED',
  'EMPLOYEE_BENEFIT', 'ESCROW', 'INSURANCE', 'BONDS', 'EQUITIES', 'OTHER',
];
const MAX_ROWS = 500;

function parseOpportunityCsv(content: string): Array<Record<string, string>> {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

/** GET /upload-template — Download CSV column template */
router.get('/upload-template', requireCRMRole(), (_req, res) => {
  const template = 'name,product_type,expected_value,currency,probability,expected_close_date,client_id,description\n'
    + 'Santos IMA Expansion,IMA_DIRECTED,20000000,PHP,75,2026-06-30,CL-00042,IMA expansion with peso bonds\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="opportunities_template.csv"');
  res.send(template);
});

/** POST /bulk-upload — Validate + insert CSV opportunity rows (max 500) */
router.post('/bulk-upload', requireCRMRole(), bulkUploadLimiter, async (req: any, res: any) => {
  const { content, owner_id } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Required: content (CSV text string)' },
    });
  }

  const rows = parseOpportunityCsv(content);
  if (rows.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'CSV has no data rows' } });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: `Maximum ${MAX_ROWS} rows per upload. Please split your file.` },
    });
  }

  const userId: number = owner_id ?? req.user?.id ?? req.userId;
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const valid: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // 1-based + header
    const rowErrors: Array<{ row: number; field: string; message: string }> = [];

    if (!r.name?.trim()) rowErrors.push({ row: rowNum, field: 'name', message: 'Required' });
    if (!r.product_type?.trim()) rowErrors.push({ row: rowNum, field: 'product_type', message: 'Required' });
    else if (!VALID_PRODUCT_TYPES.includes(r.product_type.trim())) {
      rowErrors.push({ row: rowNum, field: 'product_type', message: `Must be one of: ${VALID_PRODUCT_TYPES.join(', ')}` });
    }

    const val = parseFloat(r.expected_value);
    if (!r.expected_value || isNaN(val) || val <= 0) {
      rowErrors.push({ row: rowNum, field: 'expected_value', message: 'Must be a positive number' });
    }

    const prob = parseInt(r.probability, 10);
    if (!r.probability || isNaN(prob) || prob < 0 || prob > 100) {
      rowErrors.push({ row: rowNum, field: 'probability', message: 'Must be an integer 0-100' });
    }

    if (!r.expected_close_date?.trim()) {
      rowErrors.push({ row: rowNum, field: 'expected_close_date', message: 'Required (YYYY-MM-DD)' });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.expected_close_date.trim())) {
      rowErrors.push({ row: rowNum, field: 'expected_close_date', message: 'Must be YYYY-MM-DD format' });
    } else if (new Date(r.expected_close_date.trim()) < new Date()) {
      rowErrors.push({ row: rowNum, field: 'expected_close_date', message: 'Must be today or in the future' });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      valid.push({
        name: r.name.trim(),
        product_type: r.product_type.trim(),
        pipeline_value: val,
        pipeline_currency: r.currency?.trim() || 'PHP',
        probability: prob,
        expected_close_date: r.expected_close_date.trim(),
        client_id: r.client_id?.trim() || null,
        description: r.description?.trim() || null,
        owner_id: userId,
        source: 'BULK_UPLOAD',
      });
    }
  }

  // Insert valid rows
  const inserted: any[] = [];
  const insertErrors: Array<{ row: number; field: string; message: string }> = [];

  for (let i = 0; i < valid.length; i++) {
    try {
      const opp = await opportunityService.create(valid[i]);
      inserted.push(opp);
    } catch (err: unknown) {
      // Map back to original row index (valid[i] came from some subset of rows)
      insertErrors.push({ row: i + 2, field: 'general', message: errMsg(err) });
    }
  }

  const allErrors = [...errors, ...insertErrors];
  return res.status(allErrors.length > 0 && inserted.length === 0 ? 422 : 207).json({
    data: {
      total_rows: rows.length,
      success_count: inserted.length,
      error_count: allErrors.length,
      errors: allErrors,
      inserted_ids: inserted.map((o) => o.id),
    },
  });
});

export default router;
