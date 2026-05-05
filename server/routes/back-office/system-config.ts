/**
 * System Configuration Routes (Phase 2B — System Configuration Hardening)
 *
 * Custom route handler for system_config that replaces the generic CRUD router.
 * Enforces:
 *   - Sensitive value masking on reads
 *   - Type validation on writes
 *   - Optimistic-concurrency version checking
 *   - Restricted write access (BO_HEAD / SYSTEM_ADMIN only)
 *   - Audit logging on every mutation
 *   - Cache invalidation for runtime-configurable thresholds
 *
 *   GET    /          — list all entries (BO_MAKER+)
 *   GET    /:key      — get single entry by config_key
 *   PUT    /:key      — update value (BO_HEAD / SYSTEM_ADMIN only)
 */

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '@shared/schema';
import { requireBackOfficeRole, requireAnyRole } from '../../middleware/role-auth';
import {
  httpStatusFromError,
  safeErrorMessage,
  ValidationError,
  NotFoundError,
} from '../../services/service-errors';
import {
  systemConfigGovernanceService,
  type SystemConfigActorContext,
} from '../../services/system-config-governance-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SystemConfigRow = typeof schema.systemConfig.$inferSelect;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace config_value with '****' for sensitive rows. */
function maskRow(row: SystemConfigRow): SystemConfigRow {
  if (row.is_sensitive) {
    return { ...row, config_value: '****' };
  }
  return row;
}

function governanceContext(req: any): SystemConfigActorContext {
  return {
    actorId: req.user?.id ?? req.userId ?? 'system',
    actorRole: req.userRole ?? 'unknown',
    ipAddress: req.ip,
    correlationId: req.id,
  };
}

/**
 * Validate config_value against the declared value_type and optional
 * min_value / max_value constraints.
 * Throws ValidationError for any violation.
 */
function validateValue(
  configValue: string,
  valueType: string,
  minValue: string | null | undefined,
  maxValue: string | null | undefined,
): void {
  switch (valueType) {
    case 'INTEGER': {
      const parsed = parseInt(configValue, 10);
      if (isNaN(parsed) || String(parsed) !== configValue.trim()) {
        throw new ValidationError(`config_value must be an integer for value_type INTEGER`);
      }
      if (minValue !== null && minValue !== undefined) {
        const min = parseInt(minValue, 10);
        if (!isNaN(min) && parsed < min) {
          throw new ValidationError(`config_value ${parsed} is below minimum allowed value ${min}`);
        }
      }
      if (maxValue !== null && maxValue !== undefined) {
        const max = parseInt(maxValue, 10);
        if (!isNaN(max) && parsed > max) {
          throw new ValidationError(`config_value ${parsed} exceeds maximum allowed value ${max}`);
        }
      }
      break;
    }

    case 'DECIMAL': {
      const parsed = parseFloat(configValue);
      if (isNaN(parsed)) {
        throw new ValidationError(`config_value must be a decimal number for value_type DECIMAL`);
      }
      if (minValue !== null && minValue !== undefined) {
        const min = parseFloat(minValue);
        if (!isNaN(min) && parsed < min) {
          throw new ValidationError(`config_value ${parsed} is below minimum allowed value ${min}`);
        }
      }
      if (maxValue !== null && maxValue !== undefined) {
        const max = parseFloat(maxValue);
        if (!isNaN(max) && parsed > max) {
          throw new ValidationError(`config_value ${parsed} exceeds maximum allowed value ${max}`);
        }
      }
      break;
    }

    case 'BOOLEAN': {
      if (configValue !== 'true' && configValue !== 'false') {
        throw new ValidationError(`config_value must be 'true' or 'false' for value_type BOOLEAN`);
      }
      break;
    }

    case 'JSON': {
      try {
        JSON.parse(configValue);
      } catch {
        throw new ValidationError(`config_value is not valid JSON for value_type JSON`);
      }
      break;
    }

    case 'STRING':
    default:
      // No type-level validation for plain strings
      break;
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET / — list all system config entries.
 * Requires BO_MAKER, BO_CHECKER, BO_HEAD, or SYSTEM_ADMIN.
 * Sensitive entries have config_value replaced with '****'.
 */
router.get('/', requireBackOfficeRole(), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.is_deleted, false))
      .orderBy(schema.systemConfig.config_key);

    const data = rows.map(maskRow);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/**
 * GET /versions — durable system config version history.
 * Optional query: ?config_key=CRM_LATE_FILING_DAYS
 */
router.get('/versions', requireBackOfficeRole(), async (req, res) => {
  try {
    const configKey = typeof req.query.config_key === 'string' ? req.query.config_key : undefined;
    const data = await systemConfigGovernanceService.listVersions(configKey);
    res.json({ data });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/**
 * POST /changes/:versionId/approve — maker-checker approval and apply.
 */
router.post(
  '/changes/:versionId/approve',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const result = await systemConfigGovernanceService.approveChange(
        req.params.versionId,
        governanceContext(req),
      );
      res.json({ data: { config: maskRow(result.config), version: result.version } });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  },
);

/**
 * POST /changes/:versionId/reject — reject a pending config change.
 */
router.post(
  '/changes/:versionId/reject',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const version = await systemConfigGovernanceService.rejectChange(
        req.params.versionId,
        { rejectionReason: req.body?.rejection_reason ?? req.body?.reason },
        governanceContext(req),
      );
      res.json({ data: version });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  },
);

/**
 * POST /:key/changes — submit a governed change.
 * If the key requires approval, the active config value is not changed until approval.
 */
router.post(
  '/:key/changes',
  requireAnyRole('BO_MAKER', 'BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const result = await systemConfigGovernanceService.submitChange({
        configKey: req.params.key,
        configValue: req.body?.config_value,
        valueType: req.body?.value_type,
        minValue: req.body?.min_value,
        maxValue: req.body?.max_value,
        description: req.body?.description,
        scopeType: req.body?.scope_type,
        scopeId: req.body?.scope_id,
        changeReason: req.body?.change_reason ?? req.body?.reason,
        requiresApproval: typeof req.body?.requires_approval === 'boolean' ? req.body.requires_approval : undefined,
        isSensitive: typeof req.body?.is_sensitive === 'boolean' ? req.body.is_sensitive : undefined,
        effectiveFrom: req.body?.effective_from,
        effectiveTo: req.body?.effective_to,
      }, governanceContext(req));

      res.status(result.pending ? 202 : 200).json({
        data: {
          config: maskRow(result.config),
          version: result.version,
          pending: result.pending,
        },
      });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  },
);

/**
 * POST /:key/rollback — apply an approved historical value as a new version.
 */
router.post(
  '/:key/rollback',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const targetVersionId = req.body?.target_version_id ?? req.body?.targetVersionId;
      if (typeof targetVersionId !== 'string' || !targetVersionId.trim()) {
        throw new ValidationError('target_version_id is required');
      }

      const result = await systemConfigGovernanceService.rollbackConfig(
        req.params.key,
        {
          targetVersionId,
          changeReason: req.body?.change_reason ?? req.body?.reason,
        },
        governanceContext(req),
      );

      res.json({ data: { config: maskRow(result.config), version: result.version } });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  },
);

/**
 * GET /:key — get a single system config entry by config_key.
 * Requires BO_MAKER, BO_CHECKER, BO_HEAD, or SYSTEM_ADMIN.
 */
router.get('/:key', requireBackOfficeRole(), async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.config_key, req.params.key))
      .limit(1);

    if (!row || row.is_deleted) {
      throw new NotFoundError(`System config key '${req.params.key}' not found`);
    }

    res.json({ data: maskRow(row) });
  } catch (err: unknown) {
    const status = httpStatusFromError(err);
    res.status(status).json({ error: safeErrorMessage(err) });
  }
});

/**
 * PUT /:key — update the value of a system config entry.
 * Requires BO_HEAD or SYSTEM_ADMIN.
 *
 * Body: { config_value: string, version?: number }
 *
 * Optimistic locking: if body.version is provided and does not match
 * the current DB version, returns 409 Conflict.
 */
router.put(
  '/:key',
  requireAnyRole('BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { config_value, version: clientVersion } = req.body as {
        config_value?: unknown;
        version?: unknown;
      };

      if (config_value === undefined || config_value === null) {
        throw new ValidationError('config_value is required');
      }

      if (typeof config_value !== 'string') {
        throw new ValidationError('config_value must be a string');
      }

      // Fetch the current row
      const [current] = await db
        .select()
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.config_key, req.params.key))
        .limit(1);

      if (!current || current.is_deleted) {
        throw new NotFoundError(`System config key '${req.params.key}' not found`);
      }

      // Optimistic-concurrency check
      if (clientVersion !== undefined && clientVersion !== null) {
        const bodyVersion = typeof clientVersion === 'number'
          ? clientVersion
          : parseInt(String(clientVersion), 10);
        if (!isNaN(bodyVersion) && bodyVersion !== current.version) {
          // TC-SC-014: return structured 409 with code + current_version
          return res.status(409).json({
            error: {
              code: 'VERSION_CONFLICT',
              message: `Config has been updated by another user. Please refresh and retry.`,
              current_version: current.version,
            },
          });
        }
      }

      // Type + range validation — 422 Unprocessable Entity per TC-SC-011/012/013
      try {
        validateValue(config_value, current.value_type, current.min_value, current.max_value);
      } catch (valErr: unknown) {
        if (valErr instanceof ValidationError) {
          return res.status(422).json({ error: { code: 'UNPROCESSABLE', message: valErr.message } });
        }
        throw valErr;
      }

      const actorId = String((req as any).user?.id ?? (req as any).userId ?? 'system');
      const result = await systemConfigGovernanceService.submitChange({
        configKey: req.params.key,
        configValue: config_value,
        valueType: current.value_type,
        minValue: current.min_value,
        maxValue: current.max_value,
        description: current.description,
        scopeType: current.scope_type,
        scopeId: current.scope_id,
        changeReason: (req.body as any)?.change_reason ?? (req.body as any)?.reason ?? 'Direct system configuration update',
        requiresApproval: current.requires_approval,
        isSensitive: current.is_sensitive,
      }, {
        actorId,
        actorRole: (req as any).userRole ?? 'unknown',
        ipAddress: req.ip,
        correlationId: (req as any).id,
      });

      res.status(result.pending ? 202 : 200).json({
        data: maskRow(result.config),
        governance: {
          config_version_id: result.version.config_version_id,
          approval_status: result.version.approval_status,
          pending: result.pending,
        },
      });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  },
);

export default router;
