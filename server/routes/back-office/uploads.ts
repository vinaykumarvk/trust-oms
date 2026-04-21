/**
 * Bulk Upload API Routes (Phase 3E)
 *
 * Provides endpoints for batch upload management:
 * create, validate, submit, authorize, rollback, and error reporting.
 *
 *   GET    /                      -- List batches (?status, page, pageSize)
 *   POST   /                      -- Create batch (body: { filename, rowCount, uploadedBy })
 *   GET    /:batchId/status       -- Batch status
 *   POST   /:batchId/validate     -- Validate batch (body: { rows })
 *   POST   /:batchId/submit       -- Submit for auth
 *   POST   /:batchId/authorize    -- Authorize batch
 *   POST   /:batchId/rollback     -- Rollback batch
 *   GET    /:batchId/errors       -- Error report
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { bulkUploadService } from '../../services/bulk-upload-service';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();
router.use(requireBackOfficeRole());

// ============================================================================
// Static routes
// ============================================================================

/** GET / -- List batches */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const pageSize = req.query.pageSize
      ? parseInt(req.query.pageSize as string)
      : undefined;
    const result = await bulkUploadService.getBatches({
      status,
      page,
      pageSize,
    });
    res.json(result);
  }),
);

/** POST / -- Create batch */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { filename, rowCount, uploadedBy } = req.body;
    if (!filename) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'filename is required' },
      });
    }
    if (rowCount === undefined || rowCount === null) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'rowCount is required' },
      });
    }
    if (!uploadedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'uploadedBy (user id) is required' },
      });
    }
    const result = await bulkUploadService.createBatch({
      filename,
      rowCount: parseInt(rowCount, 10),
      uploadedBy: parseInt(uploadedBy, 10),
    });
    res.status(201).json({ data: result });
  }),
);

// ============================================================================
// Parameterized routes
// ============================================================================

/** GET /:batchId/status -- Batch status */
router.get(
  '/:batchId/status',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    try {
      const result = await bulkUploadService.getBatchStatus(batchId);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:batchId/validate -- Validate batch rows */
router.post(
  '/:batchId/validate',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'rows must be an array' },
      });
    }
    try {
      const result = await bulkUploadService.validateBatch(batchId, rows);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:batchId/submit -- Submit for authorization */
router.post(
  '/:batchId/submit',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    try {
      const result = await bulkUploadService.submitBatch(batchId);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:batchId/authorize -- Authorize batch */
router.post(
  '/:batchId/authorize',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    const { authorizedBy } = req.body;
    if (!authorizedBy) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'authorizedBy (user id) is required' },
      });
    }
    try {
      const result = await bulkUploadService.authorizeBatch(
        batchId,
        parseInt(authorizedBy, 10),
      );
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** POST /:batchId/rollback -- Rollback batch */
router.post(
  '/:batchId/rollback',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    try {
      const result = await bulkUploadService.rollbackBatch(batchId);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

/** GET /:batchId/errors -- Error report */
router.get(
  '/:batchId/errors',
  asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.batchId, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid batch ID' },
      });
    }
    try {
      const result = await bulkUploadService.getErrorReport(batchId);
      res.json({ data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: msg },
        });
      }
      throw err;
    }
  }),
);

export default router;
