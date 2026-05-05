import { createHash } from 'crypto';
import { ValidationError } from './service-errors';

export interface DomainEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string | number;
  sourceSystem: string;
  sourceReference?: string | number | null;
  schemaVersion?: number;
  payload?: Record<string, unknown> | unknown[];
  correlationId?: string | null;
  causationId?: string | null;
  parentEventId?: string | null;
  idempotencyKey?: string | null;
}

export interface DomainEventEnvelope {
  domainEventId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  sourceSystem: string;
  sourceReference: string | null;
  idempotencyKey: string;
  correlationId: string | null;
  causationId: string | null;
  parentEventId: string | null;
  payloadHash: string;
  payload: Record<string, unknown> | unknown[];
}

export interface DomainReplayHistoryEntry {
  action: string;
  replay_request_id?: string | null;
  actor_id?: string | null;
  reason?: string | null;
  status: string;
  created_at: string;
  result_payload?: Record<string, unknown> | null;
  failure_reason?: string | null;
}

function normalizeToken(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashDomainEventPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload ?? {})).digest('hex');
}

export function validateDomainEventInput(input: DomainEventInput): string[] {
  const errors: string[] = [];
  if (!normalizeToken(input.eventType)) errors.push('eventType is required');
  if (!normalizeToken(input.aggregateType)) errors.push('aggregateType is required');
  if (!String(input.aggregateId ?? '').trim()) errors.push('aggregateId is required');
  if (!normalizeToken(input.sourceSystem)) errors.push('sourceSystem is required');
  if (input.schemaVersion !== undefined && (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1)) {
    errors.push('schemaVersion must be a positive integer');
  }
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null && !String(input.idempotencyKey).trim()) {
    errors.push('idempotencyKey cannot be blank');
  }
  return errors;
}

export function buildDomainEventIdempotencyKey(input: DomainEventInput, payloadHash?: string): string {
  if (input.idempotencyKey && String(input.idempotencyKey).trim()) {
    return String(input.idempotencyKey).trim();
  }

  const schemaVersion = input.schemaVersion ?? 1;
  const sourceReference = input.sourceReference == null ? '' : normalizeToken(input.sourceReference);
  const base = [
    'DOM',
    `v${schemaVersion}`,
    normalizeToken(input.sourceSystem),
    normalizeToken(input.eventType),
  ];

  if (sourceReference) {
    return [...base, sourceReference].join(':');
  }

  return [
    ...base,
    normalizeToken(input.aggregateType),
    normalizeToken(input.aggregateId),
    (payloadHash ?? hashDomainEventPayload(input.payload ?? {})).slice(0, 24),
  ].join(':');
}

export function buildDomainEventEnvelope(input: DomainEventInput): DomainEventEnvelope {
  const errors = validateDomainEventInput(input);
  if (errors.length > 0) {
    throw new ValidationError(`Domain event invalid: ${errors.join('; ')}`);
  }

  const schemaVersion = input.schemaVersion ?? 1;
  const payload = input.payload ?? {};
  const payloadHash = hashDomainEventPayload(payload);
  const eventType = normalizeToken(input.eventType);
  const aggregateType = normalizeToken(input.aggregateType);
  const sourceSystem = normalizeToken(input.sourceSystem);
  const sourceReference = input.sourceReference == null ? null : String(input.sourceReference);
  const idempotencyKey = buildDomainEventIdempotencyKey(input, payloadHash);
  const eventIdHash = createHash('sha256').update(`${idempotencyKey}:${payloadHash}`).digest('hex');
  const domainEventId = `DE-${sourceSystem}-${eventType}-${eventIdHash.slice(0, 16)}`.replace(/[^A-Z0-9_-]/g, '_');

  return {
    domainEventId,
    eventType,
    schemaVersion,
    aggregateType,
    aggregateId: String(input.aggregateId),
    sourceSystem,
    sourceReference,
    idempotencyKey,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    parentEventId: input.parentEventId ?? null,
    payloadHash,
    payload,
  };
}

export function buildDomainReplayHistoryEntry(input: {
  action: string;
  status: string;
  replayRequestId?: string | null;
  actorId?: string | number | null;
  reason?: string | null;
  resultPayload?: Record<string, unknown> | null;
  failureReason?: string | null;
  createdAt?: Date;
}): DomainReplayHistoryEntry {
  return {
    action: normalizeToken(input.action),
    status: normalizeToken(input.status),
    replay_request_id: input.replayRequestId ?? null,
    actor_id: input.actorId == null ? null : String(input.actorId),
    reason: input.reason ?? null,
    result_payload: input.resultPayload ?? null,
    failure_reason: input.failureReason ?? null,
    created_at: (input.createdAt ?? new Date()).toISOString(),
  };
}

export function requireReplayReason(reason: unknown): string {
  const value = typeof reason === 'string' ? reason.trim() : '';
  if (value.length < 10) {
    throw new ValidationError('replay reason must be at least 10 characters');
  }
  return value;
}
