/**
 * Negative List Management — Back-Office Routes
 *
 * Endpoints for negative / blacklist / sanctions / PEP list management:
 * - CRUD for negative list entries
 * - Bulk upload
 * - Standalone screening check
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireCRMRole } from '../../middleware/role-auth';
import { negativeListService } from '../../services/negative-list-service';

const bulkUploadLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: { code: 'RATE_LIMITED', message: 'Too many bulk upload requests. Try again later.' } } });
const screeningLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: { code: 'RATE_LIMITED', message: 'Too many screening requests. Try again later.' } } });

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const router = Router();
router.use(requireCRMRole());

// ============================================================================
// List entries with filters
// ============================================================================

/** GET /negative-list — List entries with optional filters (type, status, search) */
router.get('/', async (req, res) => {
  try {
    const { type, status, search, limit, offset } = req.query;
    const entries = await negativeListService.list({
      type: type as string | undefined,
      status: status as 'active' | 'inactive' | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(String(limit)) : undefined,
      offset: offset ? parseInt(String(offset)) : undefined,
    });
    res.json({ data: entries });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Create entry
// ============================================================================

/** POST /negative-list — Add a new entry */
router.post('/', async (req, res) => {
  try {
    const {
      list_type, first_name, last_name, entity_name, email, phone,
      id_type, id_number, nationality, date_of_birth, reason, source,
      effective_date, expiry_date,
    } = req.body;

    if (!list_type) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'list_type is required' },
      });
    }

    const validTypes = ['NEGATIVE', 'BLACKLIST', 'SANCTIONS', 'PEP'];
    if (!validTypes.includes(list_type)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Invalid list_type. Must be one of: ${validTypes.join(', ')}` },
      });
    }

    const entry = await negativeListService.create({
      list_type,
      first_name,
      last_name,
      entity_name,
      email,
      phone,
      id_type,
      id_number,
      nationality,
      date_of_birth,
      reason,
      source,
      effective_date,
      expiry_date,
      created_by: req.userId || 'unknown',
    });
    res.status(201).json({ data: entry });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Update entry
// ============================================================================

/** PATCH /negative-list/:id — Edit an existing entry */
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid ID' },
      });
    }

    const updated = await negativeListService.update(id, {
      ...req.body,
      updated_by: req.userId || 'unknown',
    });
    res.json({ data: updated });
  } catch (e: unknown) {
    const status = errMsg(e).includes('not found') ? 404 : 400;
    res.status(status).json({ error: { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Bulk upload
// ============================================================================

/** POST /negative-list/upload — Bulk upload entries from parsed CSV data */
router.post('/upload', bulkUploadLimiter, async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'records array is required and must not be empty' },
      });
    }

    const result = await negativeListService.bulkUpload(
      records,
      req.userId || 'unknown',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Standalone screening check
// ============================================================================

/** POST /negative-list/check — Screen an entity against the negative list */
router.post('/check', screeningLimiter, async (req, res) => {
  try {
    const { first_name, last_name, entity_name, email, phone, mobile_phone, id_number, id_type } = req.body;

    const hasIdentifier = first_name || last_name || entity_name || email || phone || mobile_phone || id_number;
    if (!hasIdentifier) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'At least one identifying field is required' },
      });
    }

    const result = await negativeListService.screenEntity({
      first_name,
      last_name,
      entity_name,
      email,
      phone,
      mobile_phone,
      id_number,
      id_type,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

export default router;
