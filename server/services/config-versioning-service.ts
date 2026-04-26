/**
 * Configuration Versioning Service (Phase 8E)
 *
 * Tracks all configuration changes with version history,
 * diff view, and rollback capability.
 */

interface ConfigVersion {
  id: number;
  configKey: string;
  version: number;
  value: Record<string, unknown>;
  previousValue: Record<string, unknown> | null;
  changedBy: string;
  changedAt: string;
  changeReason: string;
}

// In-memory config store
const configStore = new Map<string, Record<string, unknown>>();
const versionHistory: ConfigVersion[] = [];
let versionIdSeq = 1;

export const configVersioningService = {
  /** Get current configuration value */
  getConfig(configKey: string): Record<string, unknown> | null {
    return configStore.get(configKey) ?? null;
  },

  /** Update configuration with version tracking */
  updateConfig(configKey: string, value: Record<string, unknown>, changedBy: string, reason: string): ConfigVersion {
    const previousValue = configStore.get(configKey) ?? null;
    const existingVersions = versionHistory.filter((v) => v.configKey === configKey);
    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map((v) => v.version)) + 1
      : 1;

    const entry: ConfigVersion = {
      id: versionIdSeq++,
      configKey,
      version: nextVersion,
      value,
      previousValue,
      changedBy,
      changedAt: new Date().toISOString(),
      changeReason: reason,
    };

    configStore.set(configKey, value);
    versionHistory.push(entry);

    return entry;
  },

  /** Get version history for a config key */
  getHistory(configKey: string): ConfigVersion[] {
    return versionHistory
      .filter((v) => v.configKey === configKey)
      .sort((a, b) => b.version - a.version);
  },

  /** Get diff between two versions */
  getDiff(configKey: string, fromVersion: number, toVersion: number): {
    configKey: string;
    from: { version: number; value: Record<string, unknown> } | null;
    to: { version: number; value: Record<string, unknown> } | null;
    changes: Array<{ path: string; oldValue: unknown; newValue: unknown }>;
  } {
    const fromEntry = versionHistory.find((v) => v.configKey === configKey && v.version === fromVersion);
    const toEntry = versionHistory.find((v) => v.configKey === configKey && v.version === toVersion);

    const changes: Array<{ path: string; oldValue: unknown; newValue: unknown }> = [];
    const fromVal = fromEntry?.value ?? {};
    const toVal = toEntry?.value ?? {};

    // Shallow diff
    const allKeys = new Set([...Object.keys(fromVal), ...Object.keys(toVal)]);
    for (const key of allKeys) {
      if (JSON.stringify(fromVal[key]) !== JSON.stringify(toVal[key])) {
        changes.push({ path: key, oldValue: fromVal[key], newValue: toVal[key] });
      }
    }

    return {
      configKey,
      from: fromEntry ? { version: fromEntry.version, value: fromEntry.value } : null,
      to: toEntry ? { version: toEntry.version, value: toEntry.value } : null,
      changes,
    };
  },

  /** Rollback to a specific version */
  rollback(configKey: string, targetVersion: number, rolledBackBy: string): ConfigVersion {
    const targetEntry = versionHistory.find((v) => v.configKey === configKey && v.version === targetVersion);
    if (!targetEntry) {
      throw new Error(`Version ${targetVersion} not found for config ${configKey}`);
    }

    return this.updateConfig(configKey, { ...targetEntry.value }, rolledBackBy, `Rollback to version ${targetVersion}`);
  },

  /** List all config keys */
  listConfigs(): Array<{ configKey: string; currentVersion: number; lastChanged: string }> {
    const result: Array<{ configKey: string; currentVersion: number; lastChanged: string }> = [];

    for (const [key] of configStore) {
      const versions = versionHistory.filter((v) => v.configKey === key);
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      result.push({
        configKey: key,
        currentVersion: latest?.version ?? 0,
        lastChanged: latest?.changedAt ?? '',
      });
    }

    return result;
  },
};
