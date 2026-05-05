import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertCorporateActionFieldsValid,
  buildCorporateActionFieldHistoryEntry,
  getCorporateActionFieldRules,
  validateCorporateActionEventFields,
} from '../../server/services/corporate-action-event-field-policy';
import { ValidationError } from '../../server/services/service-errors';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-H-003 corporate action dynamic event fields', () => {
  it('enforces event-type required fields with typed validation', () => {
    const missingPayment = validateCorporateActionEventFields({
      type: 'DIVIDEND_CASH',
      securityId: 1,
      exDate: '2026-05-15',
      recordDate: '2026-05-14',
      amountPerShare: '2.50',
    });

    expect(missingPayment.status).toBe('FAILED');
    expect(missingPayment.requiredFields).toEqual([
      'security_id',
      'ex_date',
      'record_date',
      'payment_date',
      'amount_per_share',
    ]);
    expect(missingPayment.errors.some((error) => error.field === 'payment_date')).toBe(true);
    expect(() => assertCorporateActionFieldsValid(missingPayment)).toThrow(ValidationError);

    const validRights = validateCorporateActionEventFields({
      type: 'RIGHTS',
      securityId: 1,
      exDate: '2026-05-15',
      recordDate: '2026-05-14',
      ratio: '0.25',
      electionDeadline: '2026-05-20',
      eventPayload: { subscription_price: '10.50' },
    });

    expect(validRights.status).toBe('PASSED');
    expect(validRights.errors).toHaveLength(0);
    expect(validRights.normalizedPayload).toMatchObject({
      security_id: 1,
      ratio: '0.25',
      subscription_price: '10.50',
      election_deadline: '2026-05-20',
    });
  });

  it('supports informational event-specific fields and history entries', () => {
    expect(getCorporateActionFieldRules('NAME_CHANGE').map((rule) => rule.field)).toContain('new_name');

    const validation = validateCorporateActionEventFields({
      type: 'NAME_CHANGE',
      securityId: 7,
      exDate: '2026-07-01',
      recordDate: '2026-07-01',
      eventPayload: { new_name: 'Metro Trust Preferred A' },
    });
    const history = buildCorporateActionFieldHistoryEntry(validation, 'SCRUB_VALIDATED', '42');

    expect(validation.status).toBe('PASSED');
    expect(history).toMatchObject({
      action: 'SCRUB_VALIDATED',
      status: 'PASSED',
      actor_id: '42',
      required_fields: ['security_id', 'ex_date', 'record_date', 'new_name'],
    });
  });

  it('persists validation metadata on the corporate action schema', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("event_payload: jsonb('event_payload').notNull().default({})");
    expect(schemaSource).toContain("required_field_snapshot: jsonb('required_field_snapshot').notNull().default([])");
    expect(schemaSource).toContain("field_validation_status: text('field_validation_status').notNull().default('PENDING')");
    expect(schemaSource).toContain("field_validation_errors: jsonb('field_validation_errors').notNull().default([])");
    expect(schemaSource).toContain("field_history: jsonb('field_history').notNull().default([])");
    expect(schemaSource).toContain("index('corporate_actions_type_field_validation_idx').on(table.type, table.field_validation_status)");
  });

  it('wires validation into ingestion, scrub, amendment, routes, and feed replay', () => {
    const serviceSource = read('server/services/corporate-actions-service.ts');
    expect(serviceSource).toContain('validateCorporateActionEventFields');
    expect(serviceSource).toContain('assertCorporateActionFieldsValid(fieldValidation)');
    expect(serviceSource).toContain('CA_FIELDS_VALIDATED');
    expect(serviceSource).toContain('CA_FIELDS_VALIDATION_FAILED');
    expect(serviceSource).toContain('field_history: appendFieldHistorySql(fieldHistory)');
    expect(serviceSource).toContain("buildCorporateActionFieldHistoryEntry(fieldValidation, 'AMENDED'");

    const routeSource = read('server/routes/back-office/corporate-actions.ts');
    expect(routeSource).toContain('eventPayload');
    expect(routeSource).toContain('dynamicFields');

    const feedServiceSource = read('server/services/corporate-action-feed-service.ts');
    expect(feedServiceSource).toContain('eventPayload: parsed.normalized as unknown as Record<string, unknown>');
  });

  it('ships a migration for field metadata, backfill, and search indexes', () => {
    const migrationSource = read('drizzle/20260504_extend_corporate_actions_dynamic_fields.sql');
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS event_payload jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS field_validation_status text NOT NULL DEFAULT 'PENDING'");
    expect(migrationSource).toContain('jsonb_strip_nulls(jsonb_build_object');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS corporate_actions_field_validation_idx');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS corporate_actions_type_field_validation_idx');
  });
});
