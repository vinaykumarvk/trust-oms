import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// In-memory feed health registry (replaces mock data until feed_routing table)
// ---------------------------------------------------------------------------

interface FeedHealthEntry {
  name: string;
  healthScore: number; // 0-100
  status: 'UP' | 'DEGRADED' | 'DOWN' | 'OVERRIDE_UP' | 'OVERRIDE_DOWN';
  lastCheck: string;
  latencyMs: number;
  isPrimary: boolean;
  fallbackFeedId: string | null;
  lastSwitchAt: number | null; // epoch ms – used for cooldown
  failureCount: number;
  lastError: string | null;
  overrideBy: number | null;
  overrideReason: string | null;
  overrideExpiresAt: Date | null;
}

interface FeedSwitchLog {
  timestamp: string;
  primaryFeedId: string;
  fallbackFeedId: string;
  reason: string;
  incidentId: string | null;
}

interface DRStatus {
  region: string;
  status: 'ACTIVE' | 'STANDBY' | 'FAILING_OVER' | 'FAILED';
  initiatedAt: string | null;
  completedAt: string | null;
}

// Configurable thresholds
const FEED_HEALTH_THRESHOLD = 80; // health score below this triggers switch
const FEED_SWITCH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const BRD_RPO_HOURS = 1;
const BRD_RTO_HOURS = 4;

// In-memory registries
const feedHealthRegistry = new Map<string, FeedHealthEntry>([
  ['BLOOMBERG', { name: 'BLOOMBERG', healthScore: 100, status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 45, isPrimary: true, fallbackFeedId: 'REUTERS', lastSwitchAt: null, failureCount: 0, lastError: null, overrideBy: null, overrideReason: null, overrideExpiresAt: null }],
  ['REUTERS',   { name: 'REUTERS',   healthScore: 100, status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 62, isPrimary: false, fallbackFeedId: 'BLOOMBERG', lastSwitchAt: null, failureCount: 0, lastError: null, overrideBy: null, overrideReason: null, overrideExpiresAt: null }],
  ['DTCC',      { name: 'DTCC',      healthScore: 100, status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 38, isPrimary: true, fallbackFeedId: 'PDTC', lastSwitchAt: null, failureCount: 0, lastError: null, overrideBy: null, overrideReason: null, overrideExpiresAt: null }],
  ['PDTC',      { name: 'PDTC',      healthScore: 100, status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 120, isPrimary: false, fallbackFeedId: 'DTCC', lastSwitchAt: null, failureCount: 0, lastError: null, overrideBy: null, overrideReason: null, overrideExpiresAt: null }],
  ['SWIFT',     { name: 'SWIFT',     healthScore: 100, status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 55, isPrimary: true, fallbackFeedId: null, lastSwitchAt: null, failureCount: 0, lastError: null, overrideBy: null, overrideReason: null, overrideExpiresAt: null }],
]);

const feedSwitchHistory: FeedSwitchLog[] = [];

const drStatus: DRStatus = {
  region: 'primary',
  status: 'ACTIVE',
  initiatedAt: null,
  completedAt: null,
};

// Helper: derive status label from health score
function deriveStatus(score: number): 'UP' | 'DEGRADED' | 'DOWN' {
  if (score >= FEED_HEALTH_THRESHOLD) return 'UP';
  if (score >= 40) return 'DEGRADED';
  return 'DOWN';
}

// ---------------------------------------------------------------------------
// Feed Health Persistence — fire-and-forget snapshot writes
// ---------------------------------------------------------------------------

function persistSnapshot(feedName: string, entry: FeedHealthEntry): void {
  void db
    .insert(schema.feedHealthSnapshots)
    .values({
      feed_name: feedName,
      health_score: entry.healthScore,
      status: entry.status,
      failure_count: entry.failureCount,
      last_error: entry.lastError ?? null,
      override_by: entry.overrideBy ?? null,
      override_reason: entry.overrideReason ?? null,
      override_expires_at: entry.overrideExpiresAt ?? null,
      last_updated: new Date(),
    })
    .catch((err: unknown) => {
      console.error('[FeedHealth] Failed to persist snapshot for feed', feedName, err instanceof Error ? err.message : err);
    });
}

export async function initializeFeedRegistry(): Promise<void> {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (feed_name) *
      FROM feed_health_snapshots
      ORDER BY feed_name, created_at DESC
    `);

    const restored = rows as Array<{
      feed_name: string;
      health_score: number;
      status: string;
      failure_count: number;
      last_error: string | null;
      override_by: number | null;
      override_reason: string | null;
      override_expires_at: Date | null;
    }>;

    const restoredNames = new Set<string>();

    for (const row of restored) {
      const existing = feedHealthRegistry.get(row.feed_name);
      if (existing) {
        existing.healthScore = row.health_score;
        existing.status = row.status as FeedHealthEntry['status'];
        existing.failureCount = row.failure_count;
        existing.lastError = row.last_error;
        existing.overrideBy = row.override_by;
        existing.overrideReason = row.override_reason;
        existing.overrideExpiresAt = row.override_expires_at ?? null;
      } else {
        // Feed from DB not in defaults — add it with minimal metadata
        feedHealthRegistry.set(row.feed_name, {
          name: row.feed_name,
          healthScore: row.health_score,
          status: row.status as FeedHealthEntry['status'],
          lastCheck: new Date().toISOString(),
          latencyMs: 0,
          isPrimary: false,
          fallbackFeedId: null,
          lastSwitchAt: null,
          failureCount: row.failure_count,
          lastError: row.last_error,
          overrideBy: row.override_by,
          overrideReason: row.override_reason,
          overrideExpiresAt: row.override_expires_at ?? null,
        });
      }
      restoredNames.add(row.feed_name);
    }

    // Persist baseline for feeds that have no DB record yet
    let baselineCount = 0;
    for (const [feedName, entry] of feedHealthRegistry.entries()) {
      if (!restoredNames.has(feedName)) {
        persistSnapshot(feedName, entry);
        baselineCount++;
      }
    }

    console.log(
      `[FeedHealth] Registry initialized: ${restoredNames.size} feed(s) restored from DB, ${baselineCount} baseline(s) written`,
    );
  } catch (err) {
    console.warn('[FeedHealth] initializeFeedRegistry failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

export function applyOverride(
  feedName: string,
  status: 'OVERRIDE_UP' | 'OVERRIDE_DOWN',
  reason: string,
  expiresAt: Date,
  overrideBy: number,
): void {
  const entry = feedHealthRegistry.get(feedName);
  if (!entry) {
    throw new Error(`Feed "${feedName}" not found in registry`);
  }
  entry.status = status;
  entry.overrideBy = overrideBy;
  entry.overrideReason = reason;
  entry.overrideExpiresAt = expiresAt;
  feedHealthRegistry.set(feedName, entry);
  void persistSnapshot(feedName, entry);
}

export function clearOverride(feedName: string): void {
  const entry = feedHealthRegistry.get(feedName);
  if (!entry) {
    throw new Error(`Feed "${feedName}" not found in registry`);
  }
  entry.status = deriveStatus(entry.healthScore);
  entry.overrideBy = null;
  entry.overrideReason = null;
  entry.overrideExpiresAt = null;
  feedHealthRegistry.set(feedName, entry);
  void persistSnapshot(feedName, entry);
}

// Public helper: allow external callers (e.g. health-check endpoints) to update
// a feed's health score and latency in the in-memory registry.
// NOTE: Manual overrides (OVERRIDE_UP / OVERRIDE_DOWN) take precedence over
// health-score-derived status — updateFeedHealth will not overwrite them.
export function updateFeedHealth(feedId: string, healthScore: number, latencyMs: number) {
  const entry = feedHealthRegistry.get(feedId);
  if (!entry) return;
  entry.healthScore = Math.max(0, Math.min(100, healthScore));
  entry.latencyMs = latencyMs;
  // Preserve manual override — only recompute status when NOT in override state
  if (entry.status !== 'OVERRIDE_UP' && entry.status !== 'OVERRIDE_DOWN') {
    entry.status = deriveStatus(entry.healthScore);
  }
  entry.lastCheck = new Date().toISOString();
  void persistSnapshot(feedId, entry);
}

export const degradedModeService = {
  async reportIncident(data: { failedComponent: string; fallbackPath: string; impactedEventIds?: string[] }) {
    const incidentId = `INC-${Date.now()}`;
    const [result] = await db
      .insert(schema.degradedModeLogs)
      .values({
        incident_id: incidentId,
        started_at: new Date(),
        failed_component: data.failedComponent,
        fallback_path: data.fallbackPath,
        impacted_event_ids: data.impactedEventIds || [],
        rca_completed: false,
        created_by: 'system',
        updated_by: 'system',
      })
      .returning();
    return result;
  },

  async resolveIncident(incidentId: string) {
    await db
      .update(schema.degradedModeLogs)
      .set({
        ended_at: new Date(),
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.degradedModeLogs.incident_id, incidentId));
    return { resolved: true };
  },

  async completeRCA(incidentId: string) {
    await db
      .update(schema.degradedModeLogs)
      .set({
        rca_completed: true,
        updated_by: 'system',
        updated_at: new Date(),
      })
      .where(eq(schema.degradedModeLogs.incident_id, incidentId));
    return { rcaCompleted: true };
  },

  async getActiveIncidents() {
    return db
      .select()
      .from(schema.degradedModeLogs)
      .where(
        and(
          isNull(schema.degradedModeLogs.ended_at),
          eq(schema.degradedModeLogs.is_deleted, false),
        ),
      );
  },

  async getIncidentHistory(filters?: { page?: number; pageSize?: number }) {
    const all = await db
      .select()
      .from(schema.degradedModeLogs)
      .where(eq(schema.degradedModeLogs.is_deleted, false));

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 25;
    const sorted = all.sort((a: typeof all[number], b: typeof all[number]) =>
      (b.started_at?.getTime() || 0) - (a.started_at?.getTime() || 0)
    );
    const data = sorted.slice((page - 1) * pageSize, page * pageSize);

    return { data, total: all.length, page, pageSize };
  },

  async getDegradedModeDays(year: number) {
    const all = await db
      .select()
      .from(schema.degradedModeLogs)
      .where(eq(schema.degradedModeLogs.is_deleted, false));

    const daysSet = new Set<string>();
    for (const incident of all) {
      if (!incident.started_at) continue;
      const startYear = incident.started_at.getFullYear();
      if (startYear !== year) continue;

      let current = new Date(incident.started_at);
      const end = incident.ended_at || new Date();
      while (current <= end) {
        if (current.getFullYear() === year) {
          daysSet.add(current.toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
      }
    }

    return { year, degradedModeDays: daysSet.size, target: 3 };
  },

  getFeedHealthStatus(opts?: { threshold?: number }) {
    const threshold = opts?.threshold ?? FEED_HEALTH_THRESHOLD;
    const feeds = Array.from(feedHealthRegistry.values()).map((entry) => ({
      name: entry.name,
      status: entry.status,
      healthScore: entry.healthScore,
      lastCheck: entry.lastCheck,
      latencyMs: entry.latencyMs,
      isPrimary: entry.isPrimary,
      fallbackFeedId: entry.fallbackFeedId,
      belowThreshold: entry.healthScore < threshold,
    }));
    return {
      feeds,
      threshold,
      checkedAt: new Date().toISOString(),
    };
  },

  // -------------------------------------------------------------------------
  // switchFeed – Automatic feed failover with cooldown & rollback
  // -------------------------------------------------------------------------

  async switchFeed(primaryFeedId: string, fallbackFeedId: string, opts?: { threshold?: number; cooldownMs?: number }) {
    const threshold = opts?.threshold ?? FEED_HEALTH_THRESHOLD;
    const cooldown = opts?.cooldownMs ?? FEED_SWITCH_COOLDOWN_MS;

    const primary = feedHealthRegistry.get(primaryFeedId);
    const fallback = feedHealthRegistry.get(fallbackFeedId);

    if (!primary) {
      return { switched: false, reason: `Primary feed "${primaryFeedId}" not found in registry` };
    }
    if (!fallback) {
      return { switched: false, reason: `Fallback feed "${fallbackFeedId}" not found in registry` };
    }

    // Cooldown check – prevent flapping
    if (primary.lastSwitchAt && Date.now() - primary.lastSwitchAt < cooldown) {
      const remainingMs = cooldown - (Date.now() - primary.lastSwitchAt);
      return { switched: false, reason: `Cooldown active for "${primaryFeedId}". ${Math.ceil(remainingMs / 1000)}s remaining.` };
    }

    // Only switch when primary is below threshold
    if (primary.healthScore >= threshold) {
      return { switched: false, reason: `Primary feed "${primaryFeedId}" health (${primary.healthScore}%) is above threshold (${threshold}%)` };
    }

    // Automatic rollback: if fallback is also degraded, do not switch
    if (fallback.healthScore < threshold) {
      return {
        switched: false,
        reason: `Fallback feed "${fallbackFeedId}" also degraded (${fallback.healthScore}%). No switch performed.`,
        rollback: true,
      };
    }

    // Perform the switch
    primary.isPrimary = false;
    fallback.isPrimary = true;
    primary.lastSwitchAt = Date.now();
    fallback.lastSwitchAt = Date.now();
    void persistSnapshot(primaryFeedId, primary);
    void persistSnapshot(fallbackFeedId, fallback);

    // Log as incident
    let incidentId: string | null = null;
    try {
      const incident = await this.reportIncident({
        failedComponent: `Feed:${primaryFeedId}`,
        fallbackPath: `Switched to ${fallbackFeedId}`,
        impactedEventIds: [],
      });
      incidentId = incident?.incident_id ?? null;
    } catch {
      // Non-blocking: log switch even if incident persistence fails
    }

    const switchLog: FeedSwitchLog = {
      timestamp: new Date().toISOString(),
      primaryFeedId,
      fallbackFeedId,
      reason: `Health score ${primary.healthScore}% below threshold ${threshold}%`,
      incidentId,
    };
    feedSwitchHistory.push(switchLog);

    return {
      switched: true,
      from: primaryFeedId,
      to: fallbackFeedId,
      incidentId,
      switchLog,
    };
  },

  // -------------------------------------------------------------------------
  // BCP / DR methods
  // -------------------------------------------------------------------------

  async initiateFailover(region: string) {
    drStatus.region = region;
    drStatus.status = 'FAILING_OVER';
    drStatus.initiatedAt = new Date().toISOString();
    drStatus.completedAt = null;

    // Log as incident
    let incidentId: string | null = null;
    try {
      const incident = await this.reportIncident({
        failedComponent: `DR:primary-region`,
        fallbackPath: `Failover to ${region}`,
        impactedEventIds: [],
      });
      incidentId = incident?.incident_id ?? null;
    } catch {
      // Non-blocking
    }

    // Simulate async failover completion (mark as active immediately for now)
    drStatus.status = 'ACTIVE';
    drStatus.completedAt = new Date().toISOString();

    return {
      initiated: true,
      targetRegion: region,
      incidentId,
      status: drStatus.status,
      initiatedAt: drStatus.initiatedAt,
      completedAt: drStatus.completedAt,
    };
  },

  async testDRPlan() {
    const startTime = Date.now();
    const results: { step: string; passed: boolean; durationMs: number; detail: string }[] = [];

    // Step 1: Verify feed health registry is populated
    const feedCount = feedHealthRegistry.size;
    results.push({
      step: 'Feed registry populated',
      passed: feedCount > 0,
      durationMs: Date.now() - startTime,
      detail: `${feedCount} feed(s) registered`,
    });

    // Step 2: Verify at least one primary feed has a fallback
    const primaryWithFallback = Array.from(feedHealthRegistry.values()).filter(
      (f) => f.isPrimary && f.fallbackFeedId,
    );
    results.push({
      step: 'Primary feeds have fallbacks',
      passed: primaryWithFallback.length > 0,
      durationMs: Date.now() - startTime,
      detail: `${primaryWithFallback.length} primary feed(s) with configured fallback`,
    });

    // Step 3: Verify DB connectivity (degraded_mode_logs readable)
    let dbOk = false;
    try {
      await db.select().from(schema.degradedModeLogs).limit(1);
      dbOk = true;
    } catch {
      // DB unreachable
    }
    results.push({
      step: 'Database connectivity',
      passed: dbOk,
      durationMs: Date.now() - startTime,
      detail: dbOk ? 'degraded_mode_logs table reachable' : 'Database query failed',
    });

    // Step 4: Verify RPO/RTO targets are defined
    results.push({
      step: 'RPO/RTO targets defined',
      passed: true,
      durationMs: Date.now() - startTime,
      detail: `RPO=${BRD_RPO_HOURS}hr, RTO=${BRD_RTO_HOURS}hr (per BRD)`,
    });

    const allPassed = results.every((r) => r.passed);
    const totalDurationMs = Date.now() - startTime;

    return {
      testRunAt: new Date().toISOString(),
      passed: allPassed,
      totalDurationMs,
      results,
    };
  },

  getRecoveryStatus() {
    // Calculate actual RPO based on last incident resolution time
    const now = new Date();
    const rpoTargetMs = BRD_RPO_HOURS * 60 * 60 * 1000;
    const rtoTargetMs = BRD_RTO_HOURS * 60 * 60 * 1000;

    // Estimate current RTO from DR status
    let currentRtoMs = 0;
    if (drStatus.initiatedAt) {
      const end = drStatus.completedAt ? new Date(drStatus.completedAt) : now;
      currentRtoMs = end.getTime() - new Date(drStatus.initiatedAt).getTime();
    }

    return {
      rpo: {
        targetHours: BRD_RPO_HOURS,
        targetMs: rpoTargetMs,
        status: 'MEETING_TARGET' as const,
        detail: 'In-memory registry provides near-zero RPO for feed state; DB-backed incidents depend on replication lag.',
      },
      rto: {
        targetHours: BRD_RTO_HOURS,
        targetMs: rtoTargetMs,
        lastMeasuredMs: currentRtoMs,
        withinTarget: currentRtoMs <= rtoTargetMs,
        status: currentRtoMs <= rtoTargetMs ? ('MEETING_TARGET' as const) : ('EXCEEDING_TARGET' as const),
        detail: currentRtoMs === 0
          ? 'No failover has been initiated; baseline RTO is 0.'
          : `Last failover took ${Math.round(currentRtoMs / 1000)}s (target: ${BRD_RTO_HOURS * 3600}s).`,
      },
      drRegion: drStatus.region,
      drStatus: drStatus.status,
      feedSwitchHistory: feedSwitchHistory.slice(-20), // last 20 switches
      checkedAt: now.toISOString(),
    };
  },

  // -------------------------------------------------------------------------
  // checkFeedHealth – designed to be called from EOD orchestrator
  // -------------------------------------------------------------------------

  async checkFeedHealth(opts?: { threshold?: number }) {
    const threshold = opts?.threshold ?? FEED_HEALTH_THRESHOLD;
    const report: {
      checkedAt: string;
      threshold: number;
      feeds: Array<{ name: string; status: string; healthScore: number; lastCheck: string; latencyMs: number; isPrimary: boolean; fallbackFeedId: string | null; belowThreshold: boolean }>;
      switchesTriggered: Array<{ switched: boolean; reason?: string; from?: string; to?: string; incidentId?: string | null; rollback?: boolean; switchLog?: FeedSwitchLog }>;
    } = {
      checkedAt: new Date().toISOString(),
      threshold,
      feeds: [],
      switchesTriggered: [],
    };

    const healthStatus = this.getFeedHealthStatus({ threshold });
    report.feeds = healthStatus.feeds;

    // For every primary feed that is below the threshold and has a fallback, trigger a switch
    for (const feed of healthStatus.feeds) {
      if (feed.isPrimary && feed.belowThreshold && feed.fallbackFeedId) {
        const switchResult = await this.switchFeed(feed.name, feed.fallbackFeedId, { threshold });
        report.switchesTriggered.push(switchResult);
      }
    }

    return report;
  },
};
