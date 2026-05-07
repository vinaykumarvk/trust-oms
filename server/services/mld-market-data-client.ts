/**
 * MLD Market Data Client
 * Fetches fixing levels and barrier observations from configurable market data source.
 * Gracefully returns null when MLD_MARKET_DATA_URL is not configured.
 */

const BASE_URL = process.env.MLD_MARKET_DATA_URL?.replace(/\/$/, '');
const API_KEY = process.env.MLD_MARKET_DATA_API_KEY ?? '';

interface FixingLevelResult {
  underlying: string;
  level: number;
  source: string;
  observationDate: string;
  timestamp: string;
}

interface BarrierCheckResult {
  underlying: string;
  currentLevel: number;
  upperLimit: number | null;
  lowerLimit: number | null;
  barrierBreached: boolean;
  breachType: 'UPPER' | 'LOWER' | 'NONE';
  source: string;
  timestamp: string;
}

async function mldMarketFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!BASE_URL) return null;
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...(options?.headers as Record<string, string> ?? {}),
      },
    });
    if (!res.ok) {
      console.warn(`[mld-market-data] ${options?.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    console.warn(`[mld-market-data] request failed: ${err.message}`);
    return null;
  }
}

/** Fetch the latest fixing level for an underlying reference (e.g., "IHSG", "USD/IDR"). */
export async function fetchFixingLevel(underlying: string, date?: string): Promise<FixingLevelResult | null> {
  const params = new URLSearchParams({ underlying });
  if (date) params.set('date', date);
  return mldMarketFetch<FixingLevelResult>(`/fixings?${params}`);
}

/** Check if a barrier has been breached for an underlying. */
export async function checkBarrierBreach(
  underlying: string,
  upperLimit: number | null,
  lowerLimit: number | null,
): Promise<BarrierCheckResult | null> {
  return mldMarketFetch<BarrierCheckResult>('/barrier-check', {
    method: 'POST',
    body: JSON.stringify({ underlying, upperLimit, lowerLimit }),
  });
}

/** Health check for the market data service. */
export async function isMarketDataAvailable(): Promise<boolean> {
  if (!BASE_URL) return false;
  const result = await mldMarketFetch<{ status: string }>('/health');
  return result?.status === 'ok';
}
