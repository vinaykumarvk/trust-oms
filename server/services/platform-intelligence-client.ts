/**
 * Platform Intelligence Service Client
 *
 * Thin HTTP client for the shared PS-WMS Platform Intelligence Service.
 * Provides AI Copilot (streaming), Morning Briefing, NBA, and
 * call-report auto-tagging backed by GPT-4o-mini + pgvector RAG.
 *
 * Configuration (env vars):
 *   PLATFORM_INTELLIGENCE_SERVICE_URL — Cloud Run URL of the intelligence service
 *   PLATFORM_INTELLIGENCE_API_KEY     — API key scoped to app_id 'trustoms'
 *
 * When PLATFORM_INTELLIGENCE_SERVICE_URL is not set every call returns a
 * graceful fallback (null / empty array) — the UI handles the degraded state.
 */

import type { Response } from 'express';

const BASE_URL = process.env.PLATFORM_INTELLIGENCE_SERVICE_URL?.replace(/\/$/, '');
const API_KEY  = process.env.PLATFORM_INTELLIGENCE_API_KEY ?? '';
const APP_ID   = 'trustoms';

// ─── types ───────────────────────────────────────────────────────────────────

export interface CopilotMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

export interface NBAction {
  action_id:    string;
  action_type:  string;         // 'call_client' | 'file_report' | 'review_portfolio' | ...
  entity_type:  string;
  entity_id:    string;
  priority:     number;         // 1 = highest
  title:        string;
  description:  string;
  due_date:     string | null;
  metadata:     Record<string, unknown>;
}

export interface MorningBriefing {
  rm_id:         number;
  generated_at:  string;
  summary:       string;        // narrative paragraph
  top_actions:   NBAction[];
  alerts:        BriefingAlert[];
}

export interface BriefingAlert {
  alert_id:    string;
  severity:    'critical' | 'warning' | 'info';
  entity_type: string;
  entity_id:   string;
  message:     string;
}

export interface CallReportTags {
  topics:      string[];        // e.g. ['portfolio_review', 'withdrawal_request']
  sentiment:   'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  action_items: string[];       // extracted follow-up actions
  keywords:    string[];
}

export interface DocumentIngestionResult {
  document_id: string;
  status:      'queued' | 'processing' | 'completed' | 'failed';
  chunk_count: number | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function intFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  if (!BASE_URL) return null;

  const url = `${BASE_URL}/api/v1${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-App-ID': APP_ID,
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      console.warn(`[platform-intelligence] ${options?.method ?? 'GET'} ${path} → ${res.status}`);
      return null;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    console.warn('[platform-intelligence] request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── AI Copilot ──────────────────────────────────────────────────────────────

/**
 * Stream an AI Copilot response to an Express response object.
 * The caller is responsible for setting appropriate response headers.
 *
 * @param messages    Conversation history (user + assistant turns)
 * @param contextIds  Entity IDs to inject as context: { clientId, portfolioId, rmUserId }
 * @param expressRes  The Express Response to pipe the SSE stream into
 */
export async function streamCopilotResponse(
  messages: CopilotMessage[],
  contextIds: { clientId?: string; portfolioId?: string; rmUserId?: number },
  expressRes: Response,
): Promise<void> {
  if (!BASE_URL) {
    expressRes.write(`data: ${JSON.stringify({ content: '[Platform intelligence not yet configured]' })}\n\n`);
    expressRes.end();
    return;
  }

  const url = `${BASE_URL}/api/v1/agents/chat`;
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-App-ID': APP_ID,
      },
      body: JSON.stringify({
        messages,
        context: {
          app_id: APP_ID,
          client_id:    contextIds.clientId    ? `${APP_ID}:${contextIds.clientId}` : undefined,
          portfolio_id: contextIds.portfolioId ? `${APP_ID}:${contextIds.portfolioId}` : undefined,
          rm_user_id:   contextIds.rmUserId,
        },
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      expressRes.write(`data: ${JSON.stringify({ error: 'Intelligence service unavailable' })}\n\n`);
      expressRes.end();
      return;
    }

    // Pipe SSE stream directly to client
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      expressRes.write(decoder.decode(value, { stream: true }));
    }

    expressRes.end();
  } catch (err) {
    console.warn('[platform-intelligence] stream error:', err instanceof Error ? err.message : err);
    expressRes.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
    expressRes.end();
  }
}

// ─── Morning Briefing ────────────────────────────────────────────────────────

/**
 * Fetch the morning briefing for an RM user.
 * Includes top NBA actions, portfolio alerts, and a narrative summary.
 */
export async function getMorningBriefing(rmUserId: number): Promise<MorningBriefing | null> {
  return intFetch<MorningBriefing>('/agents/briefing', {
    method: 'POST',
    body: JSON.stringify({
      rm_id:  rmUserId,
      app_id: APP_ID,
    }),
  });
}

// ─── Next Best Action ────────────────────────────────────────────────────────

/**
 * Fetch ranked NBA actions for an RM.
 * @param rmUserId  The trust officer / RM user ID
 * @param limit     Max actions to return (default 10)
 */
export async function getNextBestActions(
  rmUserId: number,
  limit = 10,
): Promise<NBAction[]> {
  const result = await intFetch<{ actions: NBAction[] }>('/nba', {
    method: 'POST',
    body: JSON.stringify({
      rm_id:  rmUserId,
      app_id: APP_ID,
      limit,
    }),
  });

  return result?.actions ?? [];
}

// ─── Proactive Alerts ────────────────────────────────────────────────────────

/**
 * Fetch active platform alerts for a user (portfolio breaches, KYC expiry, etc.)
 */
export async function getAlerts(rmUserId: number): Promise<BriefingAlert[]> {
  const params = new URLSearchParams({ rm_id: String(rmUserId), app_id: APP_ID });
  const result = await intFetch<{ alerts: BriefingAlert[] }>(
    `/alerts?${params.toString()}`,
  );

  return result?.alerts ?? [];
}

// ─── Call Report Tagging ─────────────────────────────────────────────────────

/**
 * Automatically tag a call report summary with topics, sentiment, and action items.
 * Call after the report is submitted/approved.
 *
 * @param reportId   TrustOMS call report ID
 * @param summary    The call report summary text
 * @param clientId   TrustOMS client ID (for context enrichment)
 */
export async function tagCallReport(
  reportId: number,
  summary: string,
  clientId?: string,
): Promise<CallReportTags | null> {
  return intFetch<CallReportTags>('/call-notes', {
    method: 'POST',
    body: JSON.stringify({
      app_id:    APP_ID,
      report_id: String(reportId),
      text:      summary,
      client_id: clientId ? `${APP_ID}:${clientId}` : undefined,
    }),
  });
}

// ─── Meeting Prep ────────────────────────────────────────────────────────────

/**
 * Generate a meeting preparation brief for an upcoming client meeting.
 * Returns a structured brief with portfolio summary, recent activity,
 * suggested talking points, and compliance notes.
 */
export async function getMeetingPrep(
  clientId: string,
  rmUserId: number,
  meetingId?: number,
): Promise<{ brief: string; talking_points: string[]; compliance_notes: string[] } | null> {
  return intFetch('/agents/meeting-prep', {
    method: 'POST',
    body: JSON.stringify({
      app_id:     APP_ID,
      client_id:  `${APP_ID}:${clientId}`,
      rm_id:      rmUserId,
      meeting_id: meetingId,
    }),
  });
}

// ─── Document Ingestion ──────────────────────────────────────────────────────

/**
 * Ingest a document into the shared intelligence knowledge base.
 * Used for BSP circulars, client emails, research reports, etc.
 *
 * @param sourceType  'regulatory' | 'research_report' | 'client_email' | 'meeting_note'
 * @param title       Document title
 * @param text        Raw text content
 * @param clientIds   Associated TrustOMS client IDs (optional)
 * @param isShared    true = visible to all apps (e.g. BSP circulars)
 */
export async function ingestDocument(
  sourceType: string,
  title: string,
  text: string,
  clientIds: string[] = [],
  isShared = false,
): Promise<DocumentIngestionResult | null> {
  return intFetch<DocumentIngestionResult>('/documents', {
    method: 'POST',
    body: JSON.stringify({
      app_id:      APP_ID,
      source_type: sourceType,
      title,
      raw_text:    text,
      client_ids:  clientIds.map(id => `${APP_ID}:${id}`),
      is_shared:   isShared,
    }),
  });
}

/**
 * Check whether the platform intelligence service is reachable.
 */
export async function isPlatformIntelligenceAvailable(): Promise<boolean> {
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
