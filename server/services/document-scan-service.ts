/**
 * Document Scan Service (Phase 3B — SR Document Storage)
 *
 * Provides async malware/virus scanning for uploaded SR documents.
 * Scan runs after upload (fire-and-forget) and updates the DB row with the result.
 *
 * SCAN_PROVIDER values:
 *   SIMULATED          — synthetic 2-second delay; quarantines executable extensions
 *   CLAMAV             — stub; marks SKIPPED (TODO: integrate clamd socket)
 *   EXTERNAL_WEBHOOK   — stub; marks SKIPPED (TODO: call external webhook)
 *   <anything else>    — marks SKIPPED (safe default)
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

const BLOCKED_EXTENSION_RE = /\.(exe|bat|sh|cmd|ps1)$/i;

// Startup warning when scan provider is a stub
const SCAN_PROVIDER = process.env.SCAN_PROVIDER ?? 'SIMULATED';
if (SCAN_PROVIDER === 'SIMULATED') {
  console.warn('[DocumentScan] WARNING: Using SIMULATED scan provider — no real virus scanning is active');
} else if (SCAN_PROVIDER === 'CLAMAV') {
  console.warn('[DocumentScan] WARNING: CLAMAV provider is a stub — documents will be marked SKIPPED');
} else if (SCAN_PROVIDER === 'EXTERNAL_WEBHOOK') {
  console.warn('[DocumentScan] WARNING: EXTERNAL_WEBHOOK provider is a stub — documents will be marked SKIPPED');
}

async function markScanResult(
  docId: number,
  status: 'CLEAN' | 'QUARANTINED' | 'SKIPPED',
): Promise<void> {
  await db
    .update(schema.serviceRequestDocuments)
    .set({
      scan_status: status,
      scan_completed_at: new Date(),
    })
    .where(eq(schema.serviceRequestDocuments.id, docId));
}

export async function scanDocument(
  docId: number,
  buffer: Buffer,
  filename: string,
): Promise<void> {
  const provider = SCAN_PROVIDER;

  try {
    if (provider === 'SIMULATED') {
      // Simulate 2-second scan delay
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));

      const isBlocked = BLOCKED_EXTENSION_RE.test(filename);
      await markScanResult(docId, isBlocked ? 'QUARANTINED' : 'CLEAN');
      return;
    }

    if (provider === 'CLAMAV') {
      // TODO: integrate with clamd Unix socket / TCP stream
      await markScanResult(docId, 'SKIPPED');
      return;
    }

    if (provider === 'EXTERNAL_WEBHOOK') {
      // TODO: POST buffer to external webhook and await verdict
      await markScanResult(docId, 'SKIPPED');
      return;
    }

    // Unrecognized provider — default to SKIPPED
    await markScanResult(docId, 'SKIPPED');
  } catch (err: unknown) {
    // Do not crash the upload flow if scanning fails; leave as PENDING
    // (a background job can retry quarantined/pending docs)
    console.error(
      '[DocumentScan] Scan failed for document',
      docId,
      '—',
      err instanceof Error ? err.message : err,
    );
  }
}
