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
  actorSource?: string;
  source?: {
    system?: string;
    channel?: string;
    component?: string;
  };
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export type NormalizedAuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ACCESS'
  | 'EXPORT'
  | 'AUTHORIZE'
  | 'REJECT'
  | 'REVERSE';

export interface AuditChangeEnvelope {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Record<string, { old: unknown; new: unknown }> | null;
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
  metadata: Record<string, unknown> | null | undefined,
  timestamp: string,
  previousHash: string,
): string {
  const payload = JSON.stringify({
    entityType,
    entityId,
    action,
    actorId: actorId ?? null,
    changes: changes ?? null,
    metadata: metadata ?? null,
    timestamp,
  });
  return createHash('sha256').update(payload + previousHash).digest('hex');
}

export function normalizeAuditEventName(action: string): string {
  const normalized = String(action || 'UPDATE')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || 'UPDATE';
}

export function normalizeAuditAction(action: string): NormalizedAuditAction {
  const eventType = normalizeAuditEventName(action);

  if (eventType.includes('LOGIN')) return 'LOGIN';
  if (eventType.includes('LOGOUT')) return 'LOGOUT';
  if (eventType.includes('DELETE') || eventType.includes('DELETED') || eventType.includes('REMOVE')) return 'DELETE';
  if (eventType.includes('REVERSE') || eventType.includes('REVERSAL') || eventType.includes('ROLLBACK')) return 'REVERSE';
  if (
    eventType.includes('REJECT') ||
    eventType.includes('DENIED') ||
    eventType.includes('DENY') ||
    eventType.includes('FAILED') ||
    eventType.includes('FAILURE') ||
    eventType.includes('BLOCKED')
  ) {
    return 'REJECT';
  }
  if (
    eventType.includes('AUTHORIZE') ||
    eventType.includes('AUTHORIZED') ||
    eventType.includes('APPROVE') ||
    eventType.includes('APPROVED') ||
    eventType.includes('ACKNOWLEDGE')
  ) {
    return 'AUTHORIZE';
  }
  if (eventType.includes('EXPORT') || eventType.includes('DOWNLOAD')) return 'EXPORT';
  if (eventType.includes('ACCESS') || eventType.includes('VIEW') || eventType.includes('READ')) return 'ACCESS';
  if (
    eventType.includes('CREATE') ||
    eventType.includes('CREATED') ||
    eventType.includes('ADD') ||
    eventType.includes('INSERT') ||
    eventType.includes('IMPORT') ||
    eventType.includes('UPLOAD') ||
    eventType.includes('GENERATE') ||
    eventType.includes('GENERATED') ||
    eventType.includes('PARSE') ||
    eventType.includes('INGEST') ||
    eventType.includes('REPLY') ||
    eventType.includes('REPLIED') ||
    eventType.includes('SUBMIT') ||
    eventType.includes('RUN') ||
    eventType.includes('QUEUE')
  ) {
    return 'CREATE';
  }

  return 'UPDATE';
}

function isDiffMap(changes: Record<string, unknown>): changes is Record<string, { old: unknown; new: unknown }> {
  const values = Object.values(changes);
  return values.length > 0 && values.every((value) => (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'old') &&
    Object.prototype.hasOwnProperty.call(value, 'new')
  ));
}

export function buildAuditChangeEnvelope(event: Pick<AuditEvent, 'before' | 'after' | 'changes'>): AuditChangeEnvelope | null {
  if (event.before || event.after) {
    const before = event.before ?? null;
    const after = event.after ?? null;
    return {
      before,
      after,
      diff: before && after ? computeDiff(before, after) : null,
    };
  }

  if (!event.changes) return null;

  if (isDiffMap(event.changes)) {
    return {
      before: null,
      after: null,
      diff: event.changes,
    };
  }

  return {
    before: null,
    after: event.changes,
    diff: null,
  };
}

export function buildAuditMetadata(
  event: AuditEvent,
  eventType: string = normalizeAuditEventName(event.action),
): Record<string, unknown> {
  const sourceSystem = event.source?.system ?? event.metadata?.source_system ?? 'TRUST_OMS';
  const sourceChannel = event.source?.channel ?? event.metadata?.source_channel ?? null;
  const sourceComponent = event.source?.component ?? event.metadata?.source_component ?? null;
  const actorSource = event.actorSource ?? event.metadata?.actor_source ?? (event.actorId ? 'USER' : 'SYSTEM');

  return {
    ...(event.metadata ?? {}),
    audit_schema_version: 1,
    event_type: eventType,
    normalized_action: normalizeAuditAction(event.action),
    actor_source: actorSource,
    source_system: sourceSystem,
    source_channel: sourceChannel,
    source_component: sourceComponent,
  };
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
    const eventType = normalizeAuditEventName(event.action);
    const normalizedAction = normalizeAuditAction(event.action);

    const changeEnvelope = buildAuditChangeEnvelope(event);
    const safeChanges = changeEnvelope ? redactSensitive(changeEnvelope as unknown as Record<string, unknown>) : null;
    const safeMetadata = redactSensitive(buildAuditMetadata(event, eventType));

    const recordHash = computeRecordHash(
      event.entityType,
      event.entityId,
      normalizedAction,
      event.actorId,
      safeChanges,
      safeMetadata,
      timestamp,
      previousHash,
    );

    await db.insert(auditRecords).values({
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_type: eventType,
      action: normalizedAction,
      actor_id: event.actorId ?? null,
      actor_role: event.actorRole ?? null,
      actor_source: String(safeMetadata.actor_source ?? 'SYSTEM'),
      source_system: String(safeMetadata.source_system ?? 'TRUST_OMS'),
      source_channel: safeMetadata.source_channel ? String(safeMetadata.source_channel) : null,
      changes: safeChanges as Record<string, unknown>,
      previous_hash: previousHash,
      record_hash: recordHash,
      ip_address: event.ipAddress ?? null,
      correlation_id: event.correlationId ?? null,
      metadata: safeMetadata,
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
      event_type: string;
      action: string;
      actor_id: string | null;
      actor_role: string | null;
      actor_source: string | null;
      source_system: string | null;
      source_channel: string | null;
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
      const eventType = normalizeAuditEventName(event.action);
      const normalizedAction = normalizeAuditAction(event.action);

      let previousHash = hashCache.get(cacheKey);
      if (previousHash === undefined) {
        previousHash = await getLastHash(event.entityType, event.entityId);
      }

      const changeEnvelope = buildAuditChangeEnvelope(event);
      const safeChanges = changeEnvelope ? redactSensitive(changeEnvelope as unknown as Record<string, unknown>) : null;
      const safeMetadata = redactSensitive(buildAuditMetadata(event, eventType));

      const recordHash = computeRecordHash(
        event.entityType,
        event.entityId,
        normalizedAction,
        event.actorId,
        safeChanges,
        safeMetadata,
        timestamp,
        previousHash,
      );

      hashCache.set(cacheKey, recordHash);

      records.push({
        entity_type: event.entityType,
        entity_id: event.entityId,
        event_type: eventType,
        action: normalizedAction,
        actor_id: event.actorId ?? null,
        actor_role: event.actorRole ?? null,
        actor_source: String(safeMetadata.actor_source ?? 'SYSTEM'),
        source_system: String(safeMetadata.source_system ?? 'TRUST_OMS'),
        source_channel: safeMetadata.source_channel ? String(safeMetadata.source_channel) : null,
        changes: safeChanges as Record<string, unknown> | null,
        previous_hash: previousHash,
        record_hash: recordHash,
        ip_address: event.ipAddress ?? null,
        correlation_id: event.correlationId ?? null,
        metadata: safeMetadata,
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
