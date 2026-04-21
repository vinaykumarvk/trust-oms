/**
 * useEntityConfig — Fetches entity registry from server and merges with
 * code-level defaults from entityFieldDefaultsMap.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@ui/lib/queryClient';
import type {
  MergedEntityConfig,
  MergedFieldConfig,
  CrossValidationRule,
  EntityFieldDefaults,
} from '@shared/entity-configs/types';
import { entityFieldDefaultsMap } from '@shared/entity-configs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServerEntityConfig {
  entityKey: string;
  displayName: string;
  displayNamePlural: string;
  fieldGroups: string[];
  fields: MergedFieldConfig[];
  crossValidationRules?: CrossValidationRule[];
}

export interface UseEntityConfigResult {
  config: MergedEntityConfig | null;
  crossValidationRules: CrossValidationRule[];
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

function mergeConfigs(
  server: ServerEntityConfig,
  defaults: EntityFieldDefaults | undefined,
): MergedEntityConfig {
  const serverFields = server.fields ?? [];
  const serverGroups = server.fieldGroups ?? [];

  if (!defaults) {
    return {
      entityKey: server.entityKey,
      displayName: server.displayName,
      displayNamePlural: server.displayNamePlural,
      fieldGroups: serverGroups,
      fields: serverFields,
    };
  }

  const mergedFields: MergedFieldConfig[] = serverFields.map((serverField) => {
    const defaultField = defaults.fields[serverField.fieldName];
    if (!defaultField) return serverField;
    // Code-level defaults are overridden by server values (server wins)
    return { ...defaultField, ...serverField };
  });

  // Add any fields in defaults that are not present on the server
  for (const [fieldName, defaultField] of Object.entries(defaults.fields)) {
    if (!mergedFields.some((f) => f.fieldName === fieldName)) {
      mergedFields.push({ ...defaultField, fieldName });
    }
  }

  return {
    entityKey: server.entityKey,
    displayName: server.displayName,
    displayNamePlural: server.displayNamePlural,
    fieldGroups:
      serverGroups.length > 0
        ? serverGroups
        : defaults.fieldGroups,
    fields: mergedFields,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEntityConfig(entityKey: string): UseEntityConfigResult {
  const query = useQuery<ServerEntityConfig>({
    queryKey: ['entity-config', entityKey],
    queryFn: async () => {
      return apiRequest('GET', `/api/v1/entity-registry/${entityKey}`);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!entityKey,
  });

  const config = query.data
    ? mergeConfigs(query.data, entityFieldDefaultsMap[entityKey])
    : null;

  const crossValidationRules = query.data?.crossValidationRules ?? [];

  return {
    config,
    crossValidationRules,
    isLoading: query.isLoading,
    error: query.error,
  };
}
