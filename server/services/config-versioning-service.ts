/**
 * Deprecated compatibility facade.
 *
 * Configuration version history is now persisted in `system_config_versions`
 * through `system-config-governance-service`. The previous implementation kept
 * process-local arrays and was not safe for restart, rollback, or audit use.
 */

import { systemConfigGovernanceService } from './system-config-governance-service';

function deprecated(): never {
  throw new Error('configVersioningService is deprecated; use systemConfigGovernanceService for durable config governance');
}

export const configVersioningService = {
  getConfig(_configKey: string): Record<string, unknown> | null {
    deprecated();
  },

  updateConfig(
    _configKey: string,
    _value: Record<string, unknown>,
    _changedBy: string,
    _reason: string,
  ): never {
    deprecated();
  },

  getHistory(configKey: string) {
    return systemConfigGovernanceService.listVersions(configKey);
  },

  getDiff(_configKey: string, _fromVersion: number, _toVersion: number): never {
    deprecated();
  },

  rollback(_configKey: string, _targetVersion: number, _rolledBackBy: string): never {
    deprecated();
  },

  listConfigs(): never {
    deprecated();
  },
};
