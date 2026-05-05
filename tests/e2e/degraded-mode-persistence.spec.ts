import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('TB-H-006 degraded mode and feed-failover persistence', () => {
  it('extends degraded incidents with owner, reason, decisions, resolution, and history', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("incident_status: text('incident_status').notNull().default('OPEN')");
    expect(schemaSource).toContain("owner_user_id: text('owner_user_id')");
    expect(schemaSource).toContain("owner_team: text('owner_team')");
    expect(schemaSource).toContain("reason: text('reason')");
    expect(schemaSource).toContain("affected_feeds: jsonb('affected_feeds').notNull().default([])");
    expect(schemaSource).toContain("failover_decisions: jsonb('failover_decisions').notNull().default([])");
    expect(schemaSource).toContain("resolution_evidence: jsonb('resolution_evidence').notNull().default({})");
    expect(schemaSource).toContain("status_history: jsonb('status_history').notNull().default([])");
    expect(schemaSource).toContain("index('degraded_mode_logs_incident_status_idx').on(table.incident_status)");
  });

  it('persists feed primary/fallback switch state in feed health snapshots', () => {
    const schemaSource = read('packages/shared/src/schema.ts');
    expect(schemaSource).toContain("is_primary: boolean('is_primary').notNull().default(false)");
    expect(schemaSource).toContain("fallback_feed_id: text('fallback_feed_id')");
    expect(schemaSource).toContain("last_switch_at: timestamp('last_switch_at', { withTimezone: true })");
    expect(schemaSource).toContain("switch_reason: text('switch_reason')");
    expect(schemaSource).toContain("index('feed_health_snapshots_primary_idx').on(table.feed_name, table.is_primary)");
  });

  it('wires persistence into degraded-mode service failover and resolution flows', () => {
    const serviceSource = read('server/services/degraded-mode-service.ts');
    expect(serviceSource).toContain('switchReason: string | null');
    expect(serviceSource).toContain('statusHistoryEntry');
    expect(serviceSource).toContain('appendStatusHistorySql');
    expect(serviceSource).toContain('is_primary: entry.isPrimary');
    expect(serviceSource).toContain('fallback_feed_id: entry.fallbackFeedId');
    expect(serviceSource).toContain('last_switch_at: entry.lastSwitchAt ? new Date(entry.lastSwitchAt) : null');
    expect(serviceSource).toContain("decision: 'SWITCHED'");
    expect(serviceSource).toContain("decision: 'ROLLBACK'");
    expect(serviceSource).toContain("incident_status: 'RESOLVED'");
    expect(serviceSource).toContain('resolution_evidence: data.resolutionEvidence ?? {}');
  });

  it('exposes owner, reason, affected feeds, and resolution evidence through routes and UI', () => {
    const routeSource = read('server/routes/back-office/degraded-mode.ts');
    expect(routeSource).toContain('ownerUserId');
    expect(routeSource).toContain('resolutionNotes');
    expect(routeSource).toContain('resolutionEvidence');

    const uiSource = read('apps/back-office/src/pages/degraded-mode-monitor.tsx');
    expect(uiSource).toContain('ownerTeam');
    expect(uiSource).toContain('affectedFeeds');
    expect(uiSource).toContain('Reason / impact summary');
    expect(uiSource).toContain('Affected feeds (comma-separated)');
  });

  it('ships a migration that backfills degraded incident and feed switch state', () => {
    const migrationSource = read('drizzle/20260504_extend_degraded_mode_persistence.sql');
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS incident_status text NOT NULL DEFAULT 'OPEN'");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS failover_decisions jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(migrationSource).toContain('status_history = CASE');
    expect(migrationSource).toContain('ALTER TABLE feed_health_snapshots');
    expect(migrationSource).toContain('ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false');
    expect(migrationSource).toContain('CREATE INDEX IF NOT EXISTS feed_health_snapshots_primary_idx');
  });
});
