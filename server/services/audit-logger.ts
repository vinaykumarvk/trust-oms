/**
 * Hash-Chained Audit Logger
 *
 * Provides SHA-256 hash-chained audit logging for all entity mutations.
 * Each audit record includes a hash of the current record chained to the
 * previous hash for the same entity, forming a tamper-evident log.
 *
 * Functions:
 *   logAuditEvent()   - Fire-and-forget single audit record insert
 *   logAuditBatch()   - Batch insert with sequential hash chaining
 *   computeDiff()     - Compute field-level before/after diff
 *   redactSensitive() - Deep-redact secrets (passwords, tokens, etc.)
 *   redactPii()       - Redact PII fields based on entity type
 */

import { createHash } from 'crypto';
import { db } from '../db';
import { auditRecords } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEvent {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorRole?: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sensitive field patterns
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE = /password|pin|secret|token|hash|otp|authorization/i;

const PII_PATTERNS: Record<string, RegExp[]> = {
  clients: [/tin$/i, /phone/i, /email/i, /birth_date/i, /address/i, /contact/i],
  users: [/email/i, /phone/i, /password/i],
  beneficialOwners: [/ubo_tin/i, /ubo_name/i],
  clientFatcaCrs: [/tin_foreign/i],
  kycCases: [/id_number/i],
};

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

function computeRecordHash(
  entityType: string,
  entityId: string,
  action: string,
  actorId: string | undefined,
  changes: Record<string, unknown> | null | undefined,
  timestamp: string,
  previousHash: string,
): string {
  const payload = JSON.stringify({
    entityType,
    entityId,
    action,
    actorId: actorId ?? null,
    changes: changes ?? null,
    timestamp,
  });
  return createHash('sha256').update(payload + previousHash).digest('hex');
}

// ---------------------------------------------------------------------------
// Previous hash lookup
// ---------------------------------------------------------------------------

async function getLastHash(entityType: string, entityId: string): Promise<string> {
  try {
    const rows = await db
      .select({ record_hash: auditRecords.record_hash })
      .from(auditRecords)
      .where(and(eq(auditRecords.entity_type, entityType), eq(auditRecords.entity_id, entityId)))
      .orderBy(desc(auditRecords.id))
      .limit(1);

    return rows[0]?.record_hash ?? 'GENESIS';
  } catch {
    return 'GENESIS';
  }
}

// ---------------------------------------------------------------------------
// logAuditEvent — fire-and-forget
// ---------------------------------------------------------------------------

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const previousHash = await getLastHash(event.entityType, event.entityId);

    const safeChanges = event.changes ? redactSensitive(event.changes) : null;

    const recordHash = computeRecordHash(
      event.entityType,
      event.entityId,
      event.action,
      event.actorId,
      safeChanges,
      timestamp,
      previousHash,
    );

    await db.insert(auditRecords).values({
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action,
      actor_id: event.actorId ?? null,
      actor_role: event.actorRole ?? null,
      changes: safeChanges as Record<string, unknown>,
      previous_hash: previousHash,
      record_hash: recordHash,
      ip_address: event.ipAddress ?? null,
      correlation_id: event.correlationId ?? null,
      metadata: (event.metadata as Record<string, unknown>) ?? null,
    });
  } catch (err) {
    // Fire-and-forget: never throw. Log to stderr for observability.
    console.error('[AUDIT] Failed to log audit event:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// logAuditBatch — sequential hash chaining within the batch
// ---------------------------------------------------------------------------

export async function logAuditBatch(events: AuditEvent[]): Promise<void> {
  if (events.length === 0) return;

  try {
    // Group by entity to chain hashes correctly
    const hashCache = new Map<string, string>();

    const records: Array<{
      entity_type: string;
      entity_id: string;
      action: string;
      actor_id: string | null;
      actor_role: string | null;
      changes: Record<string, unknown> | null;
      previous_hash: string;
      record_hash: string;
      ip_address: string | null;
      correlation_id: string | null;
      metadata: Record<string, unknown> | null;
    }> = [];

    for (const event of events) {
      const cacheKey = `${event.entityType}:${event.entityId}`;
      const timestamp = new Date().toISOString();

      let previousHash = hashCache.get(cacheKey);
      if (previousHash === undefined) {
        previousHash = await getLastHash(event.entityType, event.entityId);
      }

      const safeChanges = event.changes ? redactSensitive(event.changes) : null;

      const recordHash = computeRecordHash(
        event.entityType,
        event.entityId,
        event.action,
        event.actorId,
        safeChanges,
        timestamp,
        previousHash,
      );

      hashCache.set(cacheKey, recordHash);

      records.push({
        entity_type: event.entityType,
        entity_id: event.entityId,
        action: event.action,
        actor_id: event.actorId ?? null,
        actor_role: event.actorRole ?? null,
        changes: safeChanges as Record<string, unknown> | null,
        previous_hash: previousHash,
        record_hash: recordHash,
        ip_address: event.ipAddress ?? null,
        correlation_id: event.correlationId ?? null,
        metadata: (event.metadata as Record<string, unknown>) ?? null,
      });
    }

    if (records.length > 0) {
      await db.insert(auditRecords).values(records);
    }
  } catch (err) {
    console.error('[AUDIT] Failed to log audit batch:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// computeDiff — field-level before/after diff
// ---------------------------------------------------------------------------

export function computeDiff(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> | null {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

  for (const key of allKeys) {
    const oldVal = oldRecord[key];
    const newVal = newRecord[key];

    // Skip audit metadata fields from diff
    if (['updatedAt', 'updated_at', 'version', 'audit_hash', 'auditHash'].includes(key)) {
      continue;
    }

    // Deep compare via JSON serialization
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

// ---------------------------------------------------------------------------
// redactSensitive — deep-redact secrets
// ---------------------------------------------------------------------------

export function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else if (
      value &&
      typeof value === 'object' &&
      Array.isArray(value)
    ) {
      result[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? redactSensitive(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// redactPii — entity-specific PII masking
// ---------------------------------------------------------------------------

export function redactPii(entityType: string, obj: Record<string, unknown>): Record<string, unknown> {
  const patterns = PII_PATTERNS[entityType];
  if (!patterns || patterns.length === 0) return obj;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isPii = patterns.some((re) => re.test(key));
    if (isPii && typeof value === 'string') {
      // Mask: show first 2 and last 2 characters
      if (value.length > 4) {
        result[key] = value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
      } else {
        result[key] = '****';
      }
    } else if (isPii) {
      result[key] = '[PII_REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}
