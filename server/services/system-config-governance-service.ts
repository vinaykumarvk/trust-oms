import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import { logAuditEvent } from './audit-logger';
import { ConflictError, NotFoundError, ValidationError } from './service-errors';
import { invalidateLateFilingCache } from './call-report-service';
import {
  buildSystemConfigDiffPayload,
  buildSystemConfigGovernanceEvidence,
  buildSystemConfigVersionId,
  normalizeSystemConfigKey,
  normalizeSystemConfigScope,
  normalizeSystemConfigValueType,
  requireSystemConfigChangeReason,
  validateSystemConfigValue,
  type SystemConfigChangeType,
} from './system-config-governance-policy';

type SystemConfigRow = typeof schema.systemConfig.$inferSelect;
type SystemConfigVersionRow = typeof schema.systemConfigVersions.$inferSelect;

export interface SystemConfigActorContext {
  actorId?: string | number | null;
  actorRole?: string | null;
  ipAddress?: string;
  correlationId?: string;
}

export interface SubmitSystemConfigChangeInput {
  configKey: string;
  configValue: unknown;
  valueType?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  description?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  changeReason?: unknown;
  requiresApproval?: boolean;
  isSensitive?: boolean;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
}

export interface RejectSystemConfigChangeInput {
  rejectionReason?: unknown;
}

export interface RollbackSystemConfigInput {
  targetVersionId: string;
  changeReason?: unknown;
}

function actorId(context?: SystemConfigActorContext): string | undefined {
  if (context?.actorId === undefined || context.actorId === null) return undefined;
  return String(context.actorId);
}

function actorNumber(context?: SystemConfigActorContext): number | null {
  const value = actorId(context);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalDate(value: string | Date | null | undefined, label: string): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${label} must be a valid date`);
  return parsed;
}

function shouldInvalidateRuntimeCache(configKey: string): boolean {
  return configKey === 'CRM_LATE_FILING_DAYS' || configKey === 'CRM_LATE_FILING_CALENDAR_KEY';
}

async function publishSystemConfigChanged(configKey: string, versionId: string): Promise<void> {
  try {
    await db.execute(sql`
      SELECT pg_notify(
        'system_config_changed',
        ${JSON.stringify({ config_key: configKey, config_version_id: versionId, changed_at: new Date().toISOString() })}
      )
    `);
  } catch {
    // Change publication should never roll back an already-persisted governance decision.
  }
}

async function notifyRuntimeConfigChange(configKey: string, versionId: string): Promise<void> {
  if (shouldInvalidateRuntimeCache(configKey)) {
    invalidateLateFilingCache();
  }
  await publishSystemConfigChanged(configKey, versionId);
}

async function auditSystemConfigChange(
  action: string,
  configKey: string,
  context: SystemConfigActorContext | undefined,
  changes: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    entityType: 'system_config',
    entityId: configKey,
    action,
    actorId: actorId(context),
    actorRole: context?.actorRole ?? undefined,
    source: {
      system: 'TRUST_OMS',
      channel: 'BACK_OFFICE',
      component: 'system-config-governance-service',
    },
    changes,
    ipAddress: context?.ipAddress,
    correlationId: context?.correlationId,
  });
}

async function currentConfig(configKey: string): Promise<SystemConfigRow | null> {
  const [row] = await db
    .select()
    .from(schema.systemConfig)
    .where(and(eq(schema.systemConfig.config_key, configKey), eq(schema.systemConfig.is_deleted, false)))
    .limit(1);

  return row ?? null;
}

async function nextVersionNumber(configKey: string): Promise<number> {
  const [row] = await db
    .select({
      maxVersion: sql<number>`coalesce(max(${schema.systemConfigVersions.version_number}), 0)`,
    })
    .from(schema.systemConfigVersions)
    .where(eq(schema.systemConfigVersions.config_key, configKey));

  return Number(row?.maxVersion ?? 0) + 1;
}

async function persistAppliedConfig(data: {
  current: SystemConfigRow | null;
  configKey: string;
  configValue: string;
  valueType: string;
  minValue?: string | null;
  maxValue?: string | null;
  description?: string | null;
  scopeType: string;
  scopeId: string | null;
  requiresApproval: boolean;
  isSensitive: boolean;
  changeReason: string;
  versionId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  actor?: SystemConfigActorContext;
}): Promise<SystemConfigRow> {
  const now = new Date();
  const actor = actorId(data.actor);

  if (data.current) {
    const [updated] = await db
      .update(schema.systemConfig)
      .set({
        config_value: data.configValue,
        value_type: data.valueType,
        min_value: data.minValue ?? data.current.min_value,
        max_value: data.maxValue ?? data.current.max_value,
        description: data.description ?? data.current.description,
        scope_type: data.scopeType,
        scope_id: data.scopeId,
        requires_approval: data.requiresApproval,
        is_sensitive: data.isSensitive,
        approval_status: 'APPROVED',
        pending_config_value: null,
        change_reason: data.changeReason,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo,
        last_governance_version_id: data.versionId,
        approved_by: actorNumber(data.actor),
        approved_at: now,
        updated_at: now,
        updated_by: actor,
        version: (data.current.version ?? 1) + 1,
      })
      .where(eq(schema.systemConfig.id, data.current.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(schema.systemConfig)
    .values({
      config_key: data.configKey,
      config_value: data.configValue,
      description: data.description ?? null,
      value_type: data.valueType,
      min_value: data.minValue ?? null,
      max_value: data.maxValue ?? null,
      scope_type: data.scopeType,
      scope_id: data.scopeId,
      requires_approval: data.requiresApproval,
      is_sensitive: data.isSensitive,
      approval_status: 'APPROVED',
      pending_config_value: null,
      change_reason: data.changeReason,
      effective_from: data.effectiveFrom,
      effective_to: data.effectiveTo,
      last_governance_version_id: data.versionId,
      approved_by: actorNumber(data.actor),
      approved_at: now,
      created_by: actor,
      updated_by: actor,
    })
    .returning();

  return created;
}

export const systemConfigGovernanceService = {
  async listVersions(configKeyInput?: string): Promise<SystemConfigVersionRow[]> {
    if (configKeyInput) {
      const configKey = normalizeSystemConfigKey(configKeyInput);
      return db
        .select()
        .from(schema.systemConfigVersions)
        .where(and(eq(schema.systemConfigVersions.config_key, configKey), eq(schema.systemConfigVersions.is_deleted, false)))
        .orderBy(desc(schema.systemConfigVersions.submitted_at));
    }

    return db
      .select()
      .from(schema.systemConfigVersions)
      .where(eq(schema.systemConfigVersions.is_deleted, false))
      .orderBy(desc(schema.systemConfigVersions.submitted_at));
  },

  async submitChange(
    input: SubmitSystemConfigChangeInput,
    context?: SystemConfigActorContext,
  ): Promise<{ config: SystemConfigRow; version: SystemConfigVersionRow; pending: boolean }> {
    const configKey = normalizeSystemConfigKey(input.configKey);
    const current = await currentConfig(configKey);
    const valueType = normalizeSystemConfigValueType(input.valueType ?? current?.value_type);
    const configValue = validateSystemConfigValue(input.configValue, valueType, input.minValue ?? current?.min_value, input.maxValue ?? current?.max_value);
    const changeReason = requireSystemConfigChangeReason(input.changeReason ?? 'Direct system configuration update');
    const scope = normalizeSystemConfigScope(input.scopeType ?? current?.scope_type, input.scopeId ?? current?.scope_id);
    const requiresApproval = input.requiresApproval ?? current?.requires_approval ?? false;
    const isSensitive = input.isSensitive ?? current?.is_sensitive ?? false;
    const effectiveFrom = parseOptionalDate(input.effectiveFrom, 'effective_from') ?? new Date();
    const effectiveTo = parseOptionalDate(input.effectiveTo, 'effective_to');
    const versionNumber = await nextVersionNumber(configKey);
    const versionId = buildSystemConfigVersionId(configKey, versionNumber);
    const changeType: SystemConfigChangeType = current ? 'UPDATE' : 'CREATE';
    const approvalStatus = requiresApproval ? 'PENDING' : 'APPROVED';
    const now = new Date();

    if (approvalStatus === 'PENDING' && !current) {
      throw new ValidationError('new approval-required system config keys must be created by an approved change');
    }

    const [version] = await db
      .insert(schema.systemConfigVersions)
      .values({
        config_version_id: versionId,
        config_id: current?.id ?? null,
        config_key: configKey,
        scope_type: scope.scopeType,
        scope_id: scope.scopeId,
        version_number: versionNumber,
        previous_value: current?.config_value ?? null,
        proposed_value: configValue,
        effective_value: approvalStatus === 'APPROVED' ? configValue : null,
        value_type: valueType,
        approval_status: approvalStatus,
        change_type: changeType,
        change_reason: changeReason,
        submitted_by: actorId(context),
        submitted_at: now,
        reviewed_by: approvalStatus === 'APPROVED' ? actorId(context) : null,
        reviewed_at: approvalStatus === 'APPROVED' ? now : null,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        diff_payload: buildSystemConfigDiffPayload(current?.config_value ?? null, configValue),
        evidence_payload: buildSystemConfigGovernanceEvidence({
          action: approvalStatus === 'APPROVED' ? 'SUBMIT_AND_APPLY' : 'SUBMIT_FOR_APPROVAL',
          actorId: context?.actorId,
          actorRole: context?.actorRole,
          reason: changeReason,
          configKey,
          versionId,
          approvalStatus,
          at: now,
        }),
        created_by: actorId(context),
        updated_by: actorId(context),
      })
      .returning();

    if (approvalStatus === 'PENDING') {
      const existingConfig = current;
      if (!existingConfig) {
        throw new ValidationError('new approval-required system config keys must be created by an approved change');
      }

      const [pendingConfig] = await db
        .update(schema.systemConfig)
        .set({
          approval_status: 'PENDING',
          pending_config_value: configValue,
          change_reason: changeReason,
          last_governance_version_id: versionId,
          updated_at: now,
          updated_by: actorId(context),
          version: (existingConfig.version ?? 1) + 1,
        })
        .where(eq(schema.systemConfig.id, existingConfig.id))
        .returning();

      await auditSystemConfigChange('CONFIG_CHANGE_SUBMITTED', configKey, context, {
        config_version_id: versionId,
        approval_status: approvalStatus,
        old_value: existingConfig.is_sensitive ? '****' : existingConfig.config_value,
        proposed_value: existingConfig.is_sensitive ? '****' : configValue,
      });

      return { config: pendingConfig, version, pending: true };
    }

    const appliedConfig = await persistAppliedConfig({
      current,
      configKey,
      configValue,
      valueType,
      minValue: input.minValue,
      maxValue: input.maxValue,
      description: input.description,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      requiresApproval,
      isSensitive,
      changeReason,
      versionId,
      effectiveFrom,
      effectiveTo,
      actor: context,
    });

    await auditSystemConfigChange('CONFIG_CHANGE_APPLIED', configKey, context, {
      config_version_id: versionId,
      approval_status: approvalStatus,
      old_value: current?.is_sensitive ? '****' : current?.config_value ?? null,
      new_value: appliedConfig.is_sensitive ? '****' : configValue,
      old_version: current?.version ?? null,
      new_version: appliedConfig.version,
    });
    await notifyRuntimeConfigChange(configKey, versionId);

    return { config: appliedConfig, version, pending: false };
  },

  async approveChange(versionId: string, context?: SystemConfigActorContext): Promise<{ config: SystemConfigRow; version: SystemConfigVersionRow }> {
    const [version] = await db
      .select()
      .from(schema.systemConfigVersions)
      .where(eq(schema.systemConfigVersions.config_version_id, versionId))
      .limit(1);

    if (!version || version.is_deleted) throw new NotFoundError(`System config version '${versionId}' not found`);
    if (version.approval_status !== 'PENDING') {
      throw new ConflictError(`System config version '${versionId}' is not pending approval`);
    }

    const current = await currentConfig(version.config_key);
    validateSystemConfigValue(version.proposed_value, version.value_type, current?.min_value, current?.max_value);
    const now = new Date();
    const appliedConfig = await persistAppliedConfig({
      current,
      configKey: version.config_key,
      configValue: version.proposed_value,
      valueType: version.value_type,
      scopeType: version.scope_type,
      scopeId: version.scope_id,
      requiresApproval: current?.requires_approval ?? true,
      isSensitive: current?.is_sensitive ?? false,
      changeReason: version.change_reason,
      versionId,
      effectiveFrom: version.effective_from ?? now,
      effectiveTo: version.effective_to,
      actor: context,
    });

    const [approved] = await db
      .update(schema.systemConfigVersions)
      .set({
        approval_status: 'APPROVED',
        effective_value: version.proposed_value,
        reviewed_by: actorId(context),
        reviewed_at: now,
        evidence_payload: buildSystemConfigGovernanceEvidence({
          action: 'APPROVE_AND_APPLY',
          actorId: context?.actorId,
          actorRole: context?.actorRole,
          reason: version.change_reason,
          configKey: version.config_key,
          versionId,
          approvalStatus: 'APPROVED',
          at: now,
        }),
        updated_at: now,
        updated_by: actorId(context),
      })
      .where(eq(schema.systemConfigVersions.config_version_id, versionId))
      .returning();

    await auditSystemConfigChange('CONFIG_CHANGE_APPROVED', version.config_key, context, {
      config_version_id: versionId,
      config_key: version.config_key,
      old_value: current?.is_sensitive ? '****' : current?.config_value ?? null,
      new_value: appliedConfig.is_sensitive ? '****' : version.proposed_value,
    });
    await notifyRuntimeConfigChange(version.config_key, versionId);

    return { config: appliedConfig, version: approved };
  },

  async rejectChange(
    versionId: string,
    input: RejectSystemConfigChangeInput,
    context?: SystemConfigActorContext,
  ): Promise<SystemConfigVersionRow> {
    const [version] = await db
      .select()
      .from(schema.systemConfigVersions)
      .where(eq(schema.systemConfigVersions.config_version_id, versionId))
      .limit(1);

    if (!version || version.is_deleted) throw new NotFoundError(`System config version '${versionId}' not found`);
    if (version.approval_status !== 'PENDING') {
      throw new ConflictError(`System config version '${versionId}' is not pending approval`);
    }

    const rejectionReason = requireSystemConfigChangeReason(input.rejectionReason ?? 'Rejected by configuration approver');
    const now = new Date();
    const [rejected] = await db
      .update(schema.systemConfigVersions)
      .set({
        approval_status: 'REJECTED',
        rejection_reason: rejectionReason,
        reviewed_by: actorId(context),
        reviewed_at: now,
        evidence_payload: buildSystemConfigGovernanceEvidence({
          action: 'REJECT',
          actorId: context?.actorId,
          actorRole: context?.actorRole,
          reason: rejectionReason,
          configKey: version.config_key,
          versionId,
          approvalStatus: 'REJECTED',
          at: now,
        }),
        updated_at: now,
        updated_by: actorId(context),
      })
      .where(eq(schema.systemConfigVersions.config_version_id, versionId))
      .returning();

    const current = await currentConfig(version.config_key);
    if (current?.last_governance_version_id === versionId) {
      await db
        .update(schema.systemConfig)
        .set({
          approval_status: 'APPROVED',
          pending_config_value: null,
          updated_at: now,
          updated_by: actorId(context),
        })
        .where(eq(schema.systemConfig.id, current.id));
    }

    await auditSystemConfigChange('CONFIG_CHANGE_REJECTED', version.config_key, context, {
      config_version_id: versionId,
      rejection_reason: rejectionReason,
    });

    return rejected;
  },

  async rollbackConfig(
    configKeyInput: string,
    input: RollbackSystemConfigInput,
    context?: SystemConfigActorContext,
  ): Promise<{ config: SystemConfigRow; version: SystemConfigVersionRow }> {
    const configKey = normalizeSystemConfigKey(configKeyInput);
    const current = await currentConfig(configKey);
    if (!current) throw new NotFoundError(`System config key '${configKey}' not found`);

    const [target] = await db
      .select()
      .from(schema.systemConfigVersions)
      .where(and(
        eq(schema.systemConfigVersions.config_key, configKey),
        eq(schema.systemConfigVersions.config_version_id, input.targetVersionId),
      ))
      .limit(1);

    if (!target || target.is_deleted) throw new NotFoundError(`System config version '${input.targetVersionId}' not found`);
    if (target.approval_status !== 'APPROVED') {
      throw new ConflictError('only approved system config versions can be rollback targets');
    }

    const rollbackValue = target.effective_value ?? target.proposed_value;
    validateSystemConfigValue(rollbackValue, target.value_type, current.min_value, current.max_value);
    const changeReason = requireSystemConfigChangeReason(input.changeReason ?? `Rollback to ${input.targetVersionId}`);
    const nextNumber = await nextVersionNumber(configKey);
    const rollbackVersionId = buildSystemConfigVersionId(configKey, nextNumber);
    const now = new Date();

    const [rollbackVersion] = await db
      .insert(schema.systemConfigVersions)
      .values({
        config_version_id: rollbackVersionId,
        config_id: current.id,
        config_key: configKey,
        scope_type: target.scope_type,
        scope_id: target.scope_id,
        version_number: nextNumber,
        previous_value: current.config_value,
        proposed_value: rollbackValue,
        effective_value: rollbackValue,
        value_type: target.value_type,
        approval_status: 'APPROVED',
        change_type: 'ROLLBACK',
        change_reason: changeReason,
        submitted_by: actorId(context),
        submitted_at: now,
        reviewed_by: actorId(context),
        reviewed_at: now,
        effective_from: now,
        rollback_of_version_id: input.targetVersionId,
        diff_payload: buildSystemConfigDiffPayload(current.config_value, rollbackValue),
        evidence_payload: buildSystemConfigGovernanceEvidence({
          action: 'ROLLBACK_AND_APPLY',
          actorId: context?.actorId,
          actorRole: context?.actorRole,
          reason: changeReason,
          configKey,
          versionId: rollbackVersionId,
          approvalStatus: 'APPROVED',
          at: now,
          rollbackOfVersionId: input.targetVersionId,
        }),
        created_by: actorId(context),
        updated_by: actorId(context),
      })
      .returning();

    const appliedConfig = await persistAppliedConfig({
      current,
      configKey,
      configValue: rollbackValue,
      valueType: target.value_type,
      scopeType: target.scope_type,
      scopeId: target.scope_id,
      requiresApproval: current.requires_approval,
      isSensitive: current.is_sensitive,
      changeReason,
      versionId: rollbackVersionId,
      effectiveFrom: now,
      effectiveTo: null,
      actor: context,
    });

    await auditSystemConfigChange('CONFIG_CHANGE_ROLLED_BACK', configKey, context, {
      config_version_id: rollbackVersionId,
      rollback_of_version_id: input.targetVersionId,
      old_value: current.is_sensitive ? '****' : current.config_value,
      new_value: appliedConfig.is_sensitive ? '****' : rollbackValue,
    });
    await notifyRuntimeConfigChange(configKey, rollbackVersionId);

    return { config: appliedConfig, version: rollbackVersion };
  },
};
