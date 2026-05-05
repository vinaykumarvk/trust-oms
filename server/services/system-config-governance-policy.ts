import { createHash } from 'crypto';
import { ValidationError } from './service-errors';

export type SystemConfigValueType = 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'STRING' | 'JSON';
export type SystemConfigScopeType = 'INSTITUTION' | 'BRANCH' | 'PRODUCT' | 'TENANT' | 'CLIENT_SEGMENT';
export type SystemConfigApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SystemConfigChangeType = 'CREATE' | 'UPDATE' | 'ROLLBACK';

const SUPPORTED_VALUE_TYPES = new Set<SystemConfigValueType>([
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'STRING',
  'JSON',
]);

const SUPPORTED_SCOPE_TYPES = new Set<SystemConfigScopeType>([
  'INSTITUTION',
  'BRANCH',
  'PRODUCT',
  'TENANT',
  'CLIENT_SEGMENT',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseBound(value: string | null | undefined, valueType: SystemConfigValueType): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = valueType === 'INTEGER' ? parseInt(value, 10) : parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeSystemConfigKey(configKey: unknown): string {
  const normalized = typeof configKey === 'string' ? configKey.trim().toUpperCase() : '';
  if (!normalized) throw new ValidationError('config_key is required');
  if (!/^[A-Z0-9_.:-]+$/.test(normalized)) {
    throw new ValidationError('config_key may only contain letters, numbers, underscore, dash, colon, or dot');
  }
  return normalized;
}

export function normalizeSystemConfigValueType(value?: string | null): SystemConfigValueType {
  const normalized = String(value || 'STRING').trim().toUpperCase() as SystemConfigValueType;
  if (!SUPPORTED_VALUE_TYPES.has(normalized)) {
    throw new ValidationError(`Unsupported system config value_type: ${value}`);
  }
  return normalized;
}

export function normalizeSystemConfigScope(scopeType?: string | null, scopeId?: string | null): {
  scopeType: SystemConfigScopeType;
  scopeId: string | null;
} {
  const normalizedScope = String(scopeType || 'INSTITUTION').trim().toUpperCase() as SystemConfigScopeType;
  if (!SUPPORTED_SCOPE_TYPES.has(normalizedScope)) {
    throw new ValidationError(`Unsupported system config scope_type: ${scopeType}`);
  }

  const normalizedScopeId = typeof scopeId === 'string' && scopeId.trim() ? scopeId.trim() : null;
  if (normalizedScope === 'INSTITUTION') {
    return { scopeType: normalizedScope, scopeId: normalizedScopeId };
  }

  if (!normalizedScopeId) {
    throw new ValidationError('scope_id is required for non-institution system config scope');
  }

  return { scopeType: normalizedScope, scopeId: normalizedScopeId };
}

export function requireSystemConfigChangeReason(reason: unknown): string {
  const normalized = typeof reason === 'string' ? reason.trim() : '';
  if (normalized.length < 10) {
    throw new ValidationError('change_reason must be at least 10 characters');
  }
  return normalized;
}

export function validateSystemConfigValue(
  configValue: unknown,
  valueTypeInput?: string | null,
  minValue?: string | null,
  maxValue?: string | null,
): string {
  if (configValue === undefined || configValue === null) {
    throw new ValidationError('config_value is required');
  }
  if (typeof configValue !== 'string') {
    throw new ValidationError('config_value must be a string');
  }

  const valueType = normalizeSystemConfigValueType(valueTypeInput);
  const trimmed = configValue.trim();

  switch (valueType) {
    case 'INTEGER': {
      const parsed = parseInt(trimmed, 10);
      if (Number.isNaN(parsed) || String(parsed) !== trimmed) {
        throw new ValidationError('config_value must be an integer for value_type INTEGER');
      }
      const min = parseBound(minValue, valueType);
      const max = parseBound(maxValue, valueType);
      if (min !== null && parsed < min) {
        throw new ValidationError(`config_value ${parsed} is below minimum allowed value ${min}`);
      }
      if (max !== null && parsed > max) {
        throw new ValidationError(`config_value ${parsed} exceeds maximum allowed value ${max}`);
      }
      break;
    }

    case 'DECIMAL': {
      const parsed = parseFloat(trimmed);
      if (Number.isNaN(parsed)) {
        throw new ValidationError('config_value must be a decimal number for value_type DECIMAL');
      }
      const min = parseBound(minValue, valueType);
      const max = parseBound(maxValue, valueType);
      if (min !== null && parsed < min) {
        throw new ValidationError(`config_value ${parsed} is below minimum allowed value ${min}`);
      }
      if (max !== null && parsed > max) {
        throw new ValidationError(`config_value ${parsed} exceeds maximum allowed value ${max}`);
      }
      break;
    }

    case 'BOOLEAN':
      if (trimmed !== 'true' && trimmed !== 'false') {
        throw new ValidationError("config_value must be 'true' or 'false' for value_type BOOLEAN");
      }
      break;

    case 'JSON':
      try {
        JSON.parse(trimmed);
      } catch {
        throw new ValidationError('config_value is not valid JSON for value_type JSON');
      }
      break;

    case 'STRING':
    default:
      break;
  }

  return configValue;
}

export function buildSystemConfigVersionId(
  configKeyInput: string,
  versionNumber: number,
  at: Date = new Date(),
): string {
  const configKey = normalizeSystemConfigKey(configKeyInput);
  const keyPart = configKey.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  const stamp = at.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `CFG-${keyPart || 'KEY'}-V${String(versionNumber).padStart(4, '0')}-${stamp}`;
}

export function buildSystemConfigDiffPayload(previousValue: string | null, proposedValue: string): {
  changed: boolean;
  previous_hash: string | null;
  proposed_hash: string;
  previous_length: number | null;
  proposed_length: number;
} {
  return {
    changed: previousValue !== proposedValue,
    previous_hash: previousValue === null ? null : sha256(previousValue),
    proposed_hash: sha256(proposedValue),
    previous_length: previousValue === null ? null : previousValue.length,
    proposed_length: proposedValue.length,
  };
}

export function buildSystemConfigGovernanceEvidence(data: {
  action: string;
  actorId?: string | number | null;
  actorRole?: string | null;
  reason: string;
  configKey: string;
  versionId: string;
  approvalStatus: SystemConfigApprovalStatus;
  at?: Date;
  rollbackOfVersionId?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    action: data.action,
    actor_id: data.actorId == null ? null : String(data.actorId),
    actor_role: data.actorRole ?? null,
    reason: data.reason,
    config_key: normalizeSystemConfigKey(data.configKey),
    config_version_id: data.versionId,
    approval_status: data.approvalStatus,
    occurred_at: (data.at ?? new Date()).toISOString(),
    ...(data.rollbackOfVersionId ? { rollback_of_version_id: data.rollbackOfVersionId } : {}),
    ...(data.extra ? data.extra : {}),
  };
}
