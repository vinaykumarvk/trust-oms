import { createHash } from 'crypto';
import { ValidationError } from './service-errors';

export interface PortalEvidenceInput {
  clientId: string;
  eventType: string;
  action: string;
  sourceEntityType: string;
  sourceEntityId?: string | number | null;
  sourceEntityRef?: string | null;
  portalUserId?: string | number | null;
  sourceChannel?: string | null;
  direction?: string | null;
  eventStatus?: string | null;
  notificationStatus?: string | null;
  contentHash?: string | null;
  evidencePayload?: Record<string, unknown>;
  notificationPayload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  occurredAt?: Date;
}

export interface PortalEvidenceEnvelope {
  evidenceEventId: string;
  clientId: string;
  portalUserId: string | null;
  eventType: string;
  action: string;
  sourceChannel: string;
  sourceEntityType: string;
  sourceEntityId: string | null;
  sourceEntityRef: string | null;
  direction: string | null;
  eventStatus: string;
  notificationStatus: string | null;
  contentHash: string | null;
  evidencePayload: Record<string, unknown>;
  notificationPayload: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  occurredAt: Date;
}

function normalizeToken(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashPortalEvidencePayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload ?? {})).digest('hex');
}

export function buildPortalEvidenceEventId(input: PortalEvidenceInput): string {
  const occurredAt = input.occurredAt ?? new Date();
  const sourceEntityId = input.sourceEntityId == null ? '' : String(input.sourceEntityId);
  const hash = hashPortalEvidencePayload({
    client_id: input.clientId,
    event_type: input.eventType,
    action: input.action,
    source_entity_type: input.sourceEntityType,
    source_entity_id: sourceEntityId,
    occurred_at: occurredAt.toISOString(),
    evidence_payload: input.evidencePayload ?? {},
    notification_payload: input.notificationPayload ?? {},
  });

  return [
    'CPE',
    normalizeToken(input.eventType),
    normalizeToken(input.clientId),
    hash.slice(0, 16),
  ].join('-');
}

export function buildPortalEvidenceEnvelope(input: PortalEvidenceInput): PortalEvidenceEnvelope {
  const clientId = input.clientId?.trim();
  if (!clientId) throw new ValidationError('clientId is required');
  if (!normalizeToken(input.eventType)) throw new ValidationError('eventType is required');
  if (!normalizeToken(input.action)) throw new ValidationError('action is required');
  if (!normalizeToken(input.sourceEntityType)) throw new ValidationError('sourceEntityType is required');

  const occurredAt = input.occurredAt ?? new Date();
  return {
    evidenceEventId: buildPortalEvidenceEventId({ ...input, occurredAt }),
    clientId,
    portalUserId: input.portalUserId == null ? null : String(input.portalUserId),
    eventType: normalizeToken(input.eventType),
    action: normalizeToken(input.action),
    sourceChannel: normalizeToken(input.sourceChannel ?? 'CLIENT_PORTAL'),
    sourceEntityType: normalizeToken(input.sourceEntityType),
    sourceEntityId: input.sourceEntityId == null ? null : String(input.sourceEntityId),
    sourceEntityRef: input.sourceEntityRef ?? null,
    direction: input.direction ? normalizeToken(input.direction) : null,
    eventStatus: normalizeToken(input.eventStatus ?? 'RECORDED'),
    notificationStatus: input.notificationStatus ? normalizeToken(input.notificationStatus) : null,
    contentHash: input.contentHash ?? null,
    evidencePayload: input.evidencePayload ?? {},
    notificationPayload: input.notificationPayload ?? {},
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    correlationId: input.correlationId ?? null,
    occurredAt,
  };
}
