/**
 * Platform Feature Service Client
 *
 * Thin HTTP client for the shared PS-WMS Platform Feature Service.
 * Fetches precomputed entity features (portfolio return, client AUM,
 * RM activity metrics, etc.) from the multi-tenant feature store.
 *
 * Configuration (env vars):
 *   PLATFORM_FEATURE_SERVICE_URL  — Cloud Run URL of the feature service
 *   PLATFORM_FEATURE_API_KEY      — API key scoped to app_id 'trustoms'
 *
 * When PLATFORM_FEATURE_SERVICE_URL is not set the client returns empty
 * results silently — callers degrade gracefully until the platform goes live.
 */

const BASE_URL = process.env.PLATFORM_FEATURE_SERVICE_URL?.replace(/\/$/, '');
const API_KEY  = process.env.PLATFORM_FEATURE_API_KEY ?? '';
const APP_ID   = 'trustoms';

// ─── types ───────────────────────────────────────────────────────────────────

export interface FeatureValue {
  feature_id:       string;
  entity_type:      string;
  entity_global_id: string;
  numeric_value:    number | null;
  boolean_value:    boolean | null;
  text_value:       string | null;
  timestamp_value:  string | null;
  json_value:       unknown | null;
  value_type:       string;
  as_of_ts:         string;
  computed_at:      string;
}

export interface FeatureMap {
  [featureId: string]: FeatureValue;
}

export interface FeatureDefinition {
  feature_id:    string;
  entity:        string;
  feature_name:  string;
  priority:      string;
  feature_type:  string;
  value_type:    string;
  description:   string | null;
  unit:          string | null;
  status:        string;
}

export interface ComputeRunResult {
  run_id:          string;
  status:          string;
  total_features:  number;
  computed_count:  number;
  failed_count:    number;
  duration_ms:     number | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGlobalId(entityType: string, localId: string | number): string {
  return `${APP_ID}:${localId}`;
}

async function platformFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!BASE_URL) return null; // platform not configured yet — degrade gracefully

  const url = `${BASE_URL}/api/v1${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      console.warn(`[platform-feature] ${options?.method ?? 'GET'} ${path} → ${res.status}`);
      return null;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    console.warn('[platform-feature] request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Fetch the latest computed features for a single entity.
 *
 * @param entityType  'portfolio' | 'client' | 'user' | 'security' | 'order'
 * @param localId     The TrustOMS local ID (e.g. 'PTF-001', 'CLT-001', userId)
 * @param featureIds  Specific feature IDs to fetch; omit for all entity features
 */
export async function getEntityFeatures(
  entityType: string,
  localId: string | number,
  featureIds?: string[],
): Promise<FeatureMap> {
  const globalId = makeGlobalId(entityType, localId);

  const params = new URLSearchParams({ entity_global_id: globalId });
  if (featureIds?.length) params.set('feature_ids', featureIds.join(','));

  const result = await platformFetch<{ features: FeatureValue[] }>(
    `/features/latest?${params}`,
  );

  if (!result?.features) return {};

  return Object.fromEntries(result.features.map(f => [f.feature_id, f]));
}

/**
 * Fetch features for multiple entities of the same type in one request.
 * Returns a map keyed by local ID.
 *
 * @param entityType  Entity type (all must be the same)
 * @param localIds    Array of local TrustOMS IDs
 * @param featureIds  Specific feature IDs to fetch
 */
export async function getBatchEntityFeatures(
  entityType: string,
  localIds: Array<string | number>,
  featureIds?: string[],
): Promise<Record<string, FeatureMap>> {
  if (!localIds.length) return {};

  const globalIds = localIds.map(id => makeGlobalId(entityType, id));

  const result = await platformFetch<{ entities: Record<string, FeatureValue[]> }>(
    '/features/latest/batch',
    {
      method: 'POST',
      body: JSON.stringify({ entity_global_ids: globalIds, feature_ids: featureIds }),
    },
  );

  if (!result?.entities) return {};

  // Re-key by local ID (strip "trustoms:" prefix)
  const out: Record<string, FeatureMap> = {};
  for (const [globalId, feats] of Object.entries(result.entities)) {
    const localId = globalId.replace(/^trustoms:/, '');
    out[localId] = Object.fromEntries(feats.map(f => [f.feature_id, f]));
  }
  return out;
}

/**
 * Fetch feature history for an entity over a time range.
 */
export async function getFeatureHistory(
  entityType: string,
  localId: string | number,
  featureId: string,
  from: Date,
  to: Date,
): Promise<FeatureValue[]> {
  const globalId = makeGlobalId(entityType, localId);
  const params = new URLSearchParams({
    entity_global_id: globalId,
    feature_id: featureId,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const result = await platformFetch<{ history: FeatureValue[] }>(
    `/features/history?${params}`,
  );

  return result?.history ?? [];
}

/**
 * List all active feature definitions for TrustOMS.
 */
export async function listFeatureDefinitions(
  entityType?: string,
  priority?: string,
): Promise<FeatureDefinition[]> {
  const params = new URLSearchParams({ app_id: APP_ID });
  if (entityType) params.set('entity', entityType);
  if (priority)   params.set('priority', priority);

  const result = await platformFetch<{ definitions: FeatureDefinition[] }>(
    `/definitions?${params}`,
  );

  return result?.definitions ?? [];
}

/**
 * Trigger an on-demand feature compute run for TrustOMS.
 * Used by back-office admin to force refresh before SLA.
 */
export async function triggerComputeRun(
  priority: 'P0' | 'P1' | 'P2' = 'P0',
  entityType?: string,
): Promise<ComputeRunResult | null> {
  return platformFetch<ComputeRunResult>('/compute', {
    method: 'POST',
    body: JSON.stringify({ app_id: APP_ID, priority, entity_type: entityType }),
  });
}

/**
 * Check whether the platform feature service is reachable.
 */
export async function isPlatformAvailable(): Promise<boolean> {
  if (!BASE_URL) return false;
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      headers: { 'X-API-Key': API_KEY },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Convenience: extract a numeric value from a FeatureMap with a fallback.
 */
export function numericFeature(map: FeatureMap, featureId: string, fallback = 0): number {
  return map[featureId]?.numeric_value ?? fallback;
}

/**
 * Convenience: extract a text value from a FeatureMap.
 */
export function textFeature(map: FeatureMap, featureId: string, fallback = ''): string {
  return map[featureId]?.text_value ?? fallback;
}
