/**
 * Maker-Checker Middleware
 *
 * Express middleware that intercepts mutating requests (POST, PUT, DELETE)
 * and routes them through the approval workflow. GET requests pass through
 * unaffected.
 *
 * Response codes:
 *   200/201 — Auto-approved, change applied immediately
 *   202     — Submitted for approval, pending review
 *   403     — No workflow and not permitted
 *   409     — Duplicate submission
 */

import type { Request, Response, NextFunction } from 'express';
import { submitForApproval } from '../services/maker-checker';
import { asyncHandler } from './async-handler';

// ---------------------------------------------------------------------------
// Method-to-action mapping
// ---------------------------------------------------------------------------

function httpMethodToAction(method: string): 'create' | 'update' | 'delete' | null {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// requireApproval middleware factory
// ---------------------------------------------------------------------------

export function requireApproval(entityType: string) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Pass through GET/HEAD/OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      return next();
    }

    const action = httpMethodToAction(req.method);
    if (!action) {
      return next();
    }

    const userId = req.userId ?? 'unknown';
    const userRole = req.userRole;

    // For updates and deletes, extract the entity ID from params
    const entityId = req.params.id ?? null;

    // Build the payload
    const payload = req.body ?? {};

    // For updates, try to fetch previous values (stored on req by crud-factory)
    const previousValues = (req as any)._previousRecord ?? null;

    try {
      const result = await submitForApproval(
        {
          entityType,
          entityId,
          action,
          payload,
          previousValues,
          submittedBy: userId,
          metadata: {
            ip: req.ip,
            correlationId: (req as any).id,
            userAgent: req.headers['user-agent'],
          },
        },
        userRole,
      );

      if (result.autoApproved) {
        // Change was applied immediately
        const statusCode = action === 'create' ? 201 : 200;
        return res.status(statusCode).json({
          message: `${action} auto-approved and applied`,
          approvalRequestId: result.id,
          status: result.status,
        });
      }

      // Pending approval
      return res.status(202).json({
        message: `${action} submitted for approval`,
        approvalRequestId: result.id,
        status: result.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval submission failed';

      // Check for duplicate
      if (message.includes('duplicate') || message.includes('unique')) {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE_SUBMISSION',
            message: 'A similar approval request is already pending',
            correlation_id: (req as any).id,
          },
        });
      }

      return res.status(500).json({
        error: {
          code: 'APPROVAL_ERROR',
          message,
          correlation_id: (req as any).id,
        },
      });
    }
  });
}
