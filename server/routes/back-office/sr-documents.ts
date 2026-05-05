/**
 * Back-Office Service Request Document Routes (Phase 3B)
 *
 * Provides RM / Back-Office access to SR document listing and downloads.
 * All routes require back-office role. Back-office staff may download
 * quarantined documents (with a warning header).
 */

import { Router } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { asyncHandler } from '../../middleware/async-handler';
import { srDocumentService } from '../../services/sr-document-service';
import { httpStatusFromError, safeErrorMessage, safeContentDisposition } from '../../services/service-errors';

const router = Router();

/** GET /:srId/documents — List all documents for a service request */
router.get(
  '/:srId/documents',
  requireBackOfficeRole(),
  asyncHandler(async (req, res) => {
    const srId = parseInt(req.params.srId, 10);
    if (isNaN(srId)) {
      return res.status(400).json({ error: 'Invalid service request ID' });
    }
    const docs = await srDocumentService.list(srId);
    res.json({ data: docs });
  }),
);

/** GET /:srId/documents/:docId/download — Stream document file */
router.get(
  '/:srId/documents/:docId/download',
  requireBackOfficeRole(),
  asyncHandler(async (req: any, res) => {
    const srId = parseInt(req.params.srId, 10);
    const docId = parseInt(req.params.docId, 10);
    if (isNaN(srId)) {
      return res.status(400).json({ error: 'Invalid service request ID' });
    }
    if (isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    try {
      const { buffer, document } = await srDocumentService.download(docId, undefined, srId, {
        requesterType: 'RM',
        requesterId: req.userId ?? req.user?.id ?? 'BACK_OFFICE',
        ipAddress: req.ip,
      });

      // Surface quarantine status to calling systems via header
      if (document.scan_status === 'QUARANTINED') {
        res.setHeader('X-Scan-Status', 'QUARANTINED');
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', safeContentDisposition(document.document_name));
      res.send(buffer);
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

export default router;
