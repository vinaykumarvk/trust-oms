import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('audit normalization wiring', () => {
  it('extends audit records with searchable event/source context', () => {
    const schemaSource = readFileSync('packages/shared/src/schema.ts', 'utf8');
    const migrationSource = readFileSync(
      'drizzle/20260504_extend_audit_records_normalized_context.sql',
      'utf8',
    );

    expect(schemaSource).toContain("event_type: text('event_type')");
    expect(schemaSource).toContain("actor_source: text('actor_source')");
    expect(schemaSource).toContain("source_system: text('source_system')");
    expect(schemaSource).toContain("source_channel: text('source_channel')");
    expect(schemaSource).toContain("index('idx_audit_event_type').on(table.event_type)");
    expect(schemaSource).toContain("index('idx_audit_source').on(table.source_system, table.source_channel)");
    expect(schemaSource).toContain("index('idx_audit_correlation').on(table.correlation_id)");

    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS event_type text');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS idx_audit_event_type');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS idx_audit_source');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS idx_audit_correlation');
  });

  it('normalizes domain event names before inserting audit records', () => {
    const loggerSource = readFileSync('server/services/audit-logger.ts', 'utf8');

    expect(loggerSource).toContain('normalizeAuditEventName(event.action)');
    expect(loggerSource).toContain('normalizeAuditAction(event.action)');
    expect(loggerSource).toContain('buildAuditChangeEnvelope(event)');
    expect(loggerSource).toContain('buildAuditMetadata(event, eventType)');
    expect(loggerSource).toContain('event_type: eventType');
    expect(loggerSource).toContain('action: normalizedAction');
    expect(loggerSource).toContain('actor_source: String(safeMetadata.actor_source');
    expect(loggerSource).toContain('source_system: String(safeMetadata.source_system');
  });
});
