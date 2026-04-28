/**
 * Client Portal Ownership Middleware (Phase 2C)
 *
 * Validates that the authenticated client session owns the resource identified
 * by `:clientId` in the route parameters.  Any mismatch is:
 *   1. Logged as a structured warning (console.warn JSON) for SIEM ingestion.
 *   2. Tracked in an in-memory rate window; ≥ 3 violations in 15 minutes
 *      generates a P1 security-alert exception via the exception queue service.
 *   3. Rejected with HTTP 403.
 *
 * Usage:
 *   router.get('/portfolio-summary/:clientId', validatePortalOwnership, asyncHandler(...))
 */

import type { Request, Response, NextFunction } from 'express';
import { exceptionQueueService } from '../services/exception-queue-service';
import { notificationInboxService } from '../services/notification-inbox-service';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// In-memory violation tracker
// ---------------------------------------------------------------------------

interface ViolationState {
  count: number;
  windowStart: number;
  alerted: boolean; // true once a security alert has been fired in this window
}

const violationTracker = new Map<string, ViolationState>();
const VIOLATION_THRESHOLD = 3;
const VIOLATION_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Prune stale entries every 30 minutes to prevent unbounded memory growth.
// Entries whose window has expired are safe to evict — a fresh window will be
// started the next time that session triggers a violation.
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of violationTracker.entries()) {
    if (now - state.windowStart > VIOLATION_WINDOW_MS) {
      violationTracker.delete(key);
    }
  }
}, 30 * 60 * 1000).unref(); // .unref() so the timer does not keep the process alive

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function validatePortalOwnership(req: Request, res: Response, next: NextFunction): void {
  const sessionClientId = req.clientId as string | undefined;
  const routeClientId = req.params.clientId;

  // No :clientId param on this route — nothing to enforce
  if (!routeClientId) {
    next();
    return;
  }

  // Not authenticated — reject before ownership check
  if (!sessionClientId) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
    return;
  }

  // Ownership match — allow through
  if (sessionClientId === routeClientId) {
    next();
    return;
  }

  // -------------------------------------------------------------------------
  // Ownership mismatch path
  // -------------------------------------------------------------------------

  // Resolve a stable session key: prefer userId (JWT sub), fall back to 'unknown'
  const sessionKey: string = req.userId ?? 'unknown';

  const now = Date.now();
  let state = violationTracker.get(sessionKey);

  if (!state || now - state.windowStart > VIOLATION_WINDOW_MS) {
    // Start a fresh window
    state = { count: 1, windowStart: now, alerted: false };
  } else {
    state.count += 1;
  }
  violationTracker.set(sessionKey, state);

  // Structured audit log — compatible with SIEM/log-aggregation pipelines
  console.warn(
    JSON.stringify({
      event: 'PORTAL_OWNERSHIP_VIOLATION',
      actor_id: sessionClientId,
      action: 'PORTAL_OWNERSHIP_VIOLATION',
      resource_type: 'CLIENT_PORTAL_ROUTE',
      resource_id: routeClientId,
      attempted_client_id: routeClientId,
      actual_client_id: sessionClientId,
      path: req.path,
      ip: req.ip,
      correlation_id: (req as any).id,
      violation_count_in_window: state.count,
      timestamp: new Date().toISOString(),
    }),
  );

  // Threshold breach — raise a P1 security alert once per window (fire-and-forget)
  if (state.count >= VIOLATION_THRESHOLD && !state.alerted) {
    state.alerted = true;
    violationTracker.set(sessionKey, state);

    void exceptionQueueService
      .createException({
        exception_type: 'PORTAL_SECURITY_ALERT',
        severity: 'P1',
        title: `Client Portal repeated ownership violations (${state.count} in 15 min)`,
        description:
          `Session ${sessionKey} attempted to access resources belonging to other clients. ` +
          `Violation count: ${state.count}. Last target: ${routeClientId}.`,
        aggregate_type: 'CLIENT_SESSION',
        aggregate_id: sessionKey,
      })
      .catch((e: unknown) =>
        console.error('Failed to create security alert exception:', e),
      );

    // Notify all BO_HEAD users of the repeated violation (fire-and-forget)
    void (async () => {
      try {
        const boHeads = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.role, 'BO_HEAD'));
        const notifMsg =
          `Client ${sessionClientId} (session: ${sessionKey}) triggered ${state!.count} ` +
          `ownership violations within 15 minutes. Last attempted resource: ${routeClientId}.`;
        await notificationInboxService.notifyMultiple(
          boHeads.map((u: { id: number }) => u.id),
          {
            type: 'SECURITY_ALERT',
            title: 'Client Portal Security Alert',
            message: notifMsg,
            related_entity_type: 'CLIENT_SESSION',
          },
        );
      } catch (e: unknown) {
        console.error('Failed to notify BO_HEAD of security alert:', e);
      }
    })();
  }

  res.status(403).json({
    error: {
      code: 'PORTAL_OWNERSHIP_VIOLATION',
      message: 'Access denied: resource does not belong to your account',
    },
  });
}
