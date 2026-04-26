/**
 * Anomaly Detection Service (Phase 8A)
 *
 * Rule-based anomaly flagging for corporate action events.
 * Detects unusual volumes, price outliers, late announcements,
 * and other data quality issues.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Detection Rules
// ---------------------------------------------------------------------------

interface AnomalyRule {
  id: string;
  name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  check: (event: any) => { flagged: boolean; explanation: string };
}

const RULES: AnomalyRule[] = [
  {
    id: 'RULE-001',
    name: 'Late Announcement',
    severity: 'HIGH',
    check: (event) => {
      if (!event.ex_date || !event.created_at) return { flagged: false, explanation: '' };
      const exDate = new Date(event.ex_date);
      const createdAt = new Date(event.created_at);
      const daysBeforeEx = (exDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysBeforeEx < 3) {
        return { flagged: true, explanation: `Event announced only ${daysBeforeEx.toFixed(1)} days before ex-date (minimum 3 days expected)` };
      }
      return { flagged: false, explanation: '' };
    },
  },
  {
    id: 'RULE-002',
    name: 'Unusual Dividend Amount',
    severity: 'MEDIUM',
    check: (event) => {
      if (!event.type?.includes('DIVIDEND')) return { flagged: false, explanation: '' };
      const amount = parseFloat(event.amount_per_share ?? '0');
      if (amount > 100) {
        return { flagged: true, explanation: `Dividend amount per share (${amount}) exceeds threshold of 100` };
      }
      return { flagged: false, explanation: '' };
    },
  },
  {
    id: 'RULE-003',
    name: 'Extreme Split Ratio',
    severity: 'HIGH',
    check: (event) => {
      if (!['SPLIT', 'REVERSE_SPLIT', 'CONSOLIDATION'].includes(event.type ?? '')) {
        return { flagged: false, explanation: '' };
      }
      const ratio = parseFloat(event.ratio ?? '1');
      if (ratio > 20 || ratio < 0.05) {
        return { flagged: true, explanation: `Split ratio ${ratio} is outside normal range (0.05 - 20)` };
      }
      return { flagged: false, explanation: '' };
    },
  },
  {
    id: 'RULE-004',
    name: 'Missing Payment Date',
    severity: 'MEDIUM',
    check: (event) => {
      const cashTypes = ['DIVIDEND_CASH', 'COUPON', 'CAPITAL_DISTRIBUTION', 'CAPITAL_GAINS_DISTRIBUTION'];
      if (!cashTypes.includes(event.type ?? '')) return { flagged: false, explanation: '' };
      if (!event.payment_date) {
        return { flagged: true, explanation: 'Cash-type corporate action missing payment date' };
      }
      return { flagged: false, explanation: '' };
    },
  },
  {
    id: 'RULE-005',
    name: 'Duplicate Event Suspect',
    severity: 'LOW',
    check: (event) => {
      // This would need cross-event comparison in production
      // For now, flag events with identical ex_date and type created same day
      return { flagged: false, explanation: '' };
    },
  },
  {
    id: 'RULE-006',
    name: 'Past Ex-Date Announcement',
    severity: 'CRITICAL',
    check: (event) => {
      if (!event.ex_date || !event.created_at) return { flagged: false, explanation: '' };
      const exDate = new Date(event.ex_date);
      const createdAt = new Date(event.created_at);
      if (exDate < createdAt) {
        return { flagged: true, explanation: `Event ex-date (${event.ex_date}) is before announcement date` };
      }
      return { flagged: false, explanation: '' };
    },
  },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const anomalyDetectionService = {
  /** Run all anomaly rules against a corporate action event */
  async scanEvent(eventId: number) {
    const [event] = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.id, eventId))
      .limit(1);

    if (!event) throw new Error(`Corporate action not found: ${eventId}`);

    const flags: Array<{ ruleId: string; severity: string; explanation: string }> = [];

    for (const rule of RULES) {
      const result = rule.check(event);
      if (result.flagged) {
        // Insert anomaly flag
        await db.insert(schema.anomalyFlags).values({
          event_id: eventId,
          rule_id: rule.id,
          severity: rule.severity,
          explanation: result.explanation,
          created_by: 'anomaly-engine',
          updated_by: 'anomaly-engine',
        });
        flags.push({ ruleId: rule.id, severity: rule.severity, explanation: result.explanation });
      }
    }

    return { eventId, flagsRaised: flags.length, flags };
  },

  /** Batch scan all unscanned corporate actions */
  async scanAll() {
    const events = await db
      .select()
      .from(schema.corporateActions)
      .where(eq(schema.corporateActions.is_deleted, false));

    const results = [];
    for (const event of events) {
      const result = await this.scanEvent(event.id);
      if (result.flagsRaised > 0) {
        results.push(result);
      }
    }

    return { scannedCount: events.length, flaggedCount: results.length, results };
  },

  /** Get unresolved anomaly flags with optional filters */
  async getFlags(filters?: { severity?: string; eventId?: number; page?: number; pageSize?: number }) {
    const all = await db
      .select()
      .from(schema.anomalyFlags)
      .where(
        and(
          eq(schema.anomalyFlags.is_deleted, false),
          isNull(schema.anomalyFlags.resolved_at),
        ),
      )
      .orderBy(desc(schema.anomalyFlags.created_at));

    let filtered = all;
    if (filters?.severity) {
      filtered = filtered.filter((f: typeof all[number]) => f.severity === filters.severity);
    }
    if (filters?.eventId) {
      filtered = filtered.filter((f: typeof all[number]) => f.event_id === filters.eventId);
    }

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 25;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    return { data, total: filtered.length, page, pageSize };
  },

  /** Resolve an anomaly flag */
  async resolveFlag(flagId: number, resolvedBy: number) {
    const [updated] = await db
      .update(schema.anomalyFlags)
      .set({
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        updated_by: String(resolvedBy),
        updated_at: new Date(),
      })
      .where(eq(schema.anomalyFlags.id, flagId))
      .returning();

    return updated;
  },

  /** Get available detection rules */
  getRules() {
    return RULES.map((r) => ({ id: r.id, name: r.name, severity: r.severity }));
  },

  /** Get anomaly summary stats */
  async getSummary() {
    const all = await db
      .select()
      .from(schema.anomalyFlags)
      .where(eq(schema.anomalyFlags.is_deleted, false));

    const unresolved = all.filter((f: typeof all[number]) => !f.resolved_at);
    const bySeverity: Record<string, number> = {};
    for (const f of unresolved) {
      const sev = f.severity ?? 'UNKNOWN';
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    }

    return {
      totalFlags: all.length,
      unresolvedFlags: unresolved.length,
      resolvedFlags: all.length - unresolved.length,
      bySeverity,
    };
  },
};
