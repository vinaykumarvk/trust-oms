/**
 * MLD Treasury STP Client (Bloomberg/FXGO Integration Stub)
 * Provides interface for straight-through-processing of MLD deals to treasury dealing room.
 * Gracefully returns null when MLD_TREASURY_STP_URL is not configured.
 *
 * To activate: set MLD_TREASURY_STP_URL and MLD_TREASURY_STP_API_KEY environment variables.
 */

const BASE_URL = process.env.MLD_TREASURY_STP_URL?.replace(/\/$/, '');
const API_KEY = process.env.MLD_TREASURY_STP_API_KEY ?? '';

export interface DealSubmission {
  orderId: string;
  trancheCode: string;
  productType: 'MLD';
  underlying: string;
  optionType: string;
  notionalAmount: number;
  currency: string;
  tradeDate: string;
  valueDate: string;
  maturityDate: string;
  counterparty?: string;
  dealingDesk?: string;
}

export interface DealResult {
  dealId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  externalReference?: string;
  rejectionReason?: string;
  timestamp: string;
}

export interface DealingFeedEvent {
  eventType: 'DEAL_CONFIRMED' | 'DEAL_REJECTED' | 'DEAL_AMENDED' | 'PRICE_UPDATE';
  dealId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

async function treasuryFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
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
      console.warn(`[mld-treasury-stp] ${options?.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    console.warn(`[mld-treasury-stp] request failed: ${err.message}`);
    return null;
  }
}

/** Submit a deal to Bloomberg/FXGO for STP processing. Returns null if STP not configured. */
export async function submitDealToBloomberg(deal: DealSubmission): Promise<DealResult | null> {
  return treasuryFetch<DealResult>('/deals', {
    method: 'POST',
    body: JSON.stringify(deal),
  });
}

/** Retrieve deal status from the treasury system. */
export async function getDealStatus(dealId: string): Promise<DealResult | null> {
  return treasuryFetch<DealResult>(`/deals/${encodeURIComponent(dealId)}`);
}

/** Subscribe to dealing room feed events via polling. Returns unsubscribe function. */
export function subscribeDealingFeed(
  callback: (event: DealingFeedEvent) => void,
  intervalMs = 30_000,
): () => void {
  if (!BASE_URL) {
    console.info('[mld-treasury-stp] Dealing feed not configured — subscription skipped');
    return () => {};
  }
  let active = true;
  let lastEventId = '';

  const poll = async () => {
    while (active) {
      try {
        const events = await treasuryFetch<DealingFeedEvent[]>(
          `/feed/events?after=${encodeURIComponent(lastEventId)}&limit=50`,
        );
        if (events && events.length > 0) {
          for (const event of events) {
            callback(event);
            lastEventId = event.dealId;
          }
        }
      } catch (err: any) {
        console.warn(`[mld-treasury-stp] Feed poll error: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  poll();
  return () => { active = false; };
}

/** Health check for the treasury STP service. */
export async function isTreasurySTPAvailable(): Promise<boolean> {
  if (!BASE_URL) return false;
  const result = await treasuryFetch<{ status: string }>('/health');
  return result?.status === 'ok';
}
