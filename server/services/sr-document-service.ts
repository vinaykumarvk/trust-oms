/**
 * Service Request Document Service (Phase 3B — SR Document Storage)
 *
 * Handles upload, listing, and download of documents attached to service requests.
 * Documents are validated (MIME + extension), saved via the configured storage
 * provider, and asynchronously scanned for malware.
 */

import crypto from 'crypto';
import path from 'path';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { getStorageProvider } from './storage-provider';
import { scanDocument } from './document-scan-service';
import { NotFoundError, ForbiddenError, ValidationError, PendingScanError } from './service-errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SRDocument = typeof schema.serviceRequestDocuments.$inferSelect;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const BLOCKED_EXTENSION_RE = /\.(exe|bat|sh|cmd|ps1)$/i;

/** Retention in days by document class */
const RETENTION_DAYS: Record<string, number> = {
  TRUST_ACCOUNT_OPENING: 3650,
  KYC: 1825,
  TRANSACTION: 2555,
  OTHER: 2555,
};

function computeExpiresAt(documentClass: string | undefined): Date {
  const days = RETENTION_DAYS[documentClass ?? 'OTHER'] ?? 2555;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  return expires;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const srDocumentService = {
  /**
   * Upload a file and attach it to a service request.
   * Validates MIME type and extension, saves to storage, inserts DB row,
   * and fires off an async virus scan.
   */
  async upload(
    srId: number,
    file: Express.Multer.File,
    uploadedByType: string,
    uploadedById: number,
    documentClass?: string,
  ): Promise<SRDocument> {
    // Validate MIME type — reject immediately; no file saved
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ValidationError(
        `Unsupported file type "${file.mimetype}". ` +
        'Allowed types: PDF, JPEG, PNG, GIF, DOC, DOCX.',
      );
    }

    // Sanitize filename to prevent path traversal
    const safe = path.basename(file.originalname);
    const uuid = crypto.randomUUID();
    const relativePath = `${srId}/${uuid}-${safe}`;

    // Determine if the file extension is blocked — accepted but immediately quarantined
    const ext = path.extname(file.originalname);
    const isBlockedExt = BLOCKED_EXTENSION_RE.test(ext);

    const storageProvider = getStorageProvider();
    const reference = await storageProvider.write(relativePath, file.buffer);

    const resolvedClass = documentClass ?? 'OTHER';
    const retentionDays = RETENTION_DAYS[resolvedClass] ?? 2555;
    const expiresAt = computeExpiresAt(resolvedClass);

    // Blocked extensions start QUARANTINED synchronously; all others start PENDING and are scanned async
    const initialScanStatus: 'PENDING' | 'QUARANTINED' = isBlockedExt ? 'QUARANTINED' : 'PENDING';

    const [doc] = await db
      .insert(schema.serviceRequestDocuments)
      .values({
        sr_id: srId,
        document_name: safe,
        storage_reference: reference,
        file_size_bytes: file.size,
        mime_type: file.mimetype,
        document_class: resolvedClass as any,
        uploaded_by_type: uploadedByType as any,
        uploaded_by_id: uploadedById,
        scan_status: initialScanStatus,
        retention_days: retentionDays,
        expires_at: expiresAt,
      })
      .returning();

    // Fire-and-forget scan only for non-blocked extensions; blocked extensions are already quarantined
    if (!isBlockedExt) {
      void scanDocument(doc.id, file.buffer, safe);
    }

    return doc;
  },

  /**
   * List all non-deleted documents for a given service request.
   */
  async list(srId: number): Promise<SRDocument[]> {
    return db
      .select()
      .from(schema.serviceRequestDocuments)
      .where(
        and(
          eq(schema.serviceRequestDocuments.sr_id, srId),
          eq(schema.serviceRequestDocuments.is_deleted, false),
        ),
      )
      .orderBy(schema.serviceRequestDocuments.uploaded_at);
  },

  /**
   * Download a document by ID.
   * Optionally verifies that the SR belongs to the requesting client (IDOR guard).
   * Quarantined documents are blocked from client downloads.
   */
  async download(
    docId: number,
    requesterClientId?: string,
  ): Promise<{ buffer: Buffer; document: SRDocument }> {
    const [doc] = await db
      .select()
      .from(schema.serviceRequestDocuments)
      .where(
        and(
          eq(schema.serviceRequestDocuments.id, docId),
          eq(schema.serviceRequestDocuments.is_deleted, false),
        ),
      )
      .limit(1);

    if (!doc) {
      throw new NotFoundError(`Document ${docId} not found`);
    }

    // Client-portal IDOR guard: verify SR ownership
    if (requesterClientId) {
      const [sr] = await db
        .select({ client_id: schema.serviceRequests.client_id })
        .from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.id, doc.sr_id))
        .limit(1);

      if (!sr || sr.client_id !== requesterClientId) {
        throw new ForbiddenError('Access denied');
      }

      // Clients may not download quarantined documents
      if (doc.scan_status === 'QUARANTINED') {
        throw new ForbiddenError('Document is quarantined');
      }

      // Document scan still in progress — client must retry
      if (doc.scan_status === 'PENDING') {
        throw new PendingScanError('Document scan in progress, please try again later');
      }
    }

    if (!doc.storage_reference) {
      throw new NotFoundError('Document has no storage reference');
    }

    const storageProvider = getStorageProvider();
    const buffer = await storageProvider.read(doc.storage_reference);

    return { buffer, document: doc };
  },
};
