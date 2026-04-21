import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

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

  getFeedHealthStatus() {
    // Mock feed health — in production this would ping actual feed connectors
    return {
      feeds: [
        { name: 'BLOOMBERG', status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 45 },
        { name: 'REUTERS', status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 62 },
        { name: 'DTCC', status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 38 },
        { name: 'PDTC', status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 120 },
        { name: 'SWIFT', status: 'UP', lastCheck: new Date().toISOString(), latencyMs: 55 },
      ],
    };
  },
};
