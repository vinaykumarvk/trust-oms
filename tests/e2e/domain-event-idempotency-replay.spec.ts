import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildDomainEventEnvelope,
  buildDomainEventIdempotencyKey,
  hashDomainEventPayload,
  requireReplayReason,
  stableStringify,
} from '../../server/services/domain-event-idempotency-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-I-003 shared domain event idempotency and replay model', () => {
  it('builds stable payload hashes and idempotency keys independent of JSON key order', () => {
    const payloadA = { b: 2, a: { z: 3, y: [1, 2] } };
    const payloadB = { a: { y: [1, 2], z: 3 }, b: 2 };

    expect(stableStringify(payloadA)).toBe(stableStringify(payloadB));
    expect(hashDomainEventPayload(payloadA)).toBe(hashDomainEventPayload(payloadB));

    const keyA = buildDomainEventIdempotencyKey({
      eventType: 'tfp.accrual.created',
      aggregateType: 'accrual',
      aggregateId: 42,
      sourceSystem: 'trustfees',
      sourceReference: 'ACCR-42',
      payload: payloadA,
    });
    const keyB = buildDomainEventIdempotencyKey({
      eventType: 'TFP_ACCRUAL_CREATED',
      aggregateType: 'ACCRUAL',
      aggregateId: 42,
      sourceSystem: 'TRUSTFEES',
      sourceReference: 'ACCR-42',
      payload: payloadB,
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toBe('DOM:v1:TRUSTFEES:TFP_ACCRUAL_CREATED:ACCR-42');
  });

  it('wraps source metadata, aggregate identity, correlation, and payload hash into an envelope', () => {
    const envelope = buildDomainEventEnvelope({
      eventType: 'ca.feed.received',
      schemaVersion: 2,
      aggregateType: 'corporate_action_feed_message',
      aggregateId: 'PSE-1',
      sourceSystem: 'pse-edge',
      sourceReference: 'PSE-1',
      correlationId: 'REQ-123',
      causationId: 'PARENT-1',
      payload: { event_id: 'PSE-1', caev: 'DVCA' },
    });

    expect(envelope.domainEventId).toMatch(/^DE-PSE-EDGE-CA_FEED_RECEIVED-/);
    expect(envelope.eventType).toBe('CA_FEED_RECEIVED');
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.idempotencyKey).toBe('DOM:v2:PSE-EDGE:CA_FEED_RECEIVED:PSE-1');
    expect(envelope.correlationId).toBe('REQ-123');
    expect(envelope.payloadHash).toHaveLength(64);
    expect(() => requireReplayReason('short')).toThrow(ValidationError);
  });

  it('adds shared domain event and replay request tables with idempotency indexes', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain('export const domainEvents = pgTable');
    expect(schemaSource).toContain("domain_event_id: text('domain_event_id').unique().notNull()");
    expect(schemaSource).toContain("idempotency_key: text('idempotency_key').unique().notNull()");
    expect(schemaSource).toContain("event_correlation_id: text('event_correlation_id')");
    expect(schemaSource).toContain("replay_history: jsonb('replay_history').notNull().default([])");
    expect(schemaSource).toContain("uniqueIndex('ux_domain_events_idempotency').on(table.idempotency_key)");
    expect(schemaSource).toContain('export const domainEventReplayRequests = pgTable');
    expect(schemaSource).toContain("replay_request_id: text('replay_request_id').unique().notNull()");
  });

  it('adds service operations for duplicate detection and replay lifecycle state', () => {
    const serviceSource = read('server/services/domain-event-service.ts');
    expect(serviceSource).toContain('async recordEvent');
    expect(serviceSource).toContain('DOMAIN_EVENT_DUPLICATE_SEEN');
    expect(serviceSource).toContain('duplicate_count: sql`${schema.domainEvents.duplicate_count} + 1`');
    expect(serviceSource).toContain('async requestReplay');
    expect(serviceSource).toContain('async markReplayStarted');
    expect(serviceSource).toContain('async completeReplay');
    expect(serviceSource).toContain('async failReplay');
    expect(serviceSource).toContain('replay_history: appendReplayHistorySql');
  });

  it('wires existing TFP and corporate-action events into the shared ledger without replacing domain tables', () => {
    const tfpSource = read('server/services/tfp-accounting-event-service.ts');
    expect(tfpSource).toContain('recordSharedDomainEvent');
    expect(tfpSource).toContain("sourceSystem: 'TRUSTFEES_PRO'");
    expect(tfpSource).toContain('DOMAIN_EVENT_LEDGER_FAILED');

    const caFeedSource = read('server/services/corporate-action-feed-service.ts');
    expect(caFeedSource).toContain('recordCaFeedDomainEvent');
    expect(caFeedSource).toContain("eventType: 'CORPORATE_ACTION_FEED_MESSAGE_RECEIVED'");
    expect(caFeedSource).toContain('idempotencyKey: input.idempotencyKey');
  });

  it('exposes replay governance routes and migration support', () => {
    const routeSource = read('server/routes/back-office/domain-events.ts');
    expect(routeSource).toContain("router.get('/replay-requests'");
    expect(routeSource).toContain("router.post('/replay-requests/:requestId/start'");
    expect(routeSource).toContain("router.post('/replay-requests/:requestId/complete'");
    expect(routeSource).toContain("router.post('/:id/replay-requests'");

    const routesSource = read('server/routes.ts');
    expect(routesSource).toContain("app.use('/api/v1/domain-events', domainEventsRouter)");

    const migrationSource = read('drizzle/20260504_add_domain_event_idempotency_replay.sql');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS domain_events');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS domain_event_replay_requests');
    expect(migrationSource).toContain('ux_domain_events_idempotency');
    expect(migrationSource).toContain('FROM tfp_accounting_events');
    expect(migrationSource).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
  });
});
