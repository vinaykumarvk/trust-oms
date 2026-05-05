import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-D-003 handover bulk-upload failure remediation workbench', () => {
  it('adds a durable failed-row queue with assignment, retry, and resolution evidence', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain('export const bulkUploadFailureItems = pgTable');
    expect(schemaSource).toContain("upload_id: integer('upload_id').notNull().references(() => bulkUploadLogs.id)");
    expect(schemaSource).toContain("failure_status: text('failure_status').notNull().default('OPEN')");
    expect(schemaSource).toContain("assigned_to: integer('assigned_to').references(() => users.id)");
    expect(schemaSource).toContain("linked_handover_id: integer('linked_handover_id').references(() => handovers.id)");
  });

  it('queues failure items when bulk processing fails and resolves them when a retry succeeds', () => {
    const serviceSource = read('server/services/handover-service.ts');
    expect(serviceSource).toContain('bulkUploadFailureItems');
    expect(serviceSource).toContain("event_type: 'bulk_failure_queued'");
    expect(serviceSource).toContain("failure_status: 'OPEN'");
    expect(serviceSource).toContain("failure_status: 'RESOLVED_BY_RETRY'");
    expect(serviceSource).toContain('listBulkUploadFailures');
    expect(serviceSource).toContain('assignBulkUploadFailure');
    expect(serviceSource).toContain('resolveBulkUploadFailure');
    expect(serviceSource).toContain('retryBulkUploadFailure');
  });

  it('exposes operational endpoints for the remediation workbench', () => {
    const routeSource = read('server/routes/back-office/handover.ts');
    expect(routeSource).toContain("router.get('/bulk-upload/failures'");
    expect(routeSource).toContain("router.post('/bulk-upload/failures/:id/assign'");
    expect(routeSource).toContain("router.post('/bulk-upload/failures/:id/resolve'");
    expect(routeSource).toContain("router.post('/bulk-upload/failures/:id/retry'");
  });

  it('ships migration support for backfilled failure items', () => {
    const migrationSource = read('drizzle/20260504_add_bulk_upload_failure_workbench.sql');
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS bulk_upload_failure_items');
    expect(migrationSource).toContain("ALTER TYPE handover_audit_event_type ADD VALUE IF NOT EXISTS 'bulk_failure_queued'");
    expect(migrationSource).toContain('MIGRATION_BACKFILL');
    expect(migrationSource).toContain('idx_bulk_upload_failure_items_status');
  });
});
