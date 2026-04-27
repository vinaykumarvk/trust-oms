/**
 * Platform Intelligence Service Routes — Back Office
 *
 * Exposes AI Copilot (streaming), Morning Briefing, Next Best Actions,
 * alerts, call-report auto-tagging, and meeting prep backed by the
 * shared PS-WMS Platform Intelligence Service.
 *
 * Mount point: /api/v1/intelligence (registered in back-office index)
 */

import { Router, type Request } from 'express';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import {
  streamCopilotResponse,
  getMorningBriefing,
  getNextBestActions,
  getAlerts,
  tagCallReport,
  getMeetingPrep,
  ingestDocument,
  isPlatformIntelligenceAvailable,
} from '../../services/platform-intelligence-client';

const router = Router();

function getAuthenticatedUserId(req: Request): number | null {
  const rawUserId = req.userId ?? String((req as any).session?.userId ?? '');
  const parsed = Number(rawUserId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// ─── platform health ──────────────────────────────────────────────────────────

// GET /intelligence/platform-status
router.get('/platform-status', requireBackOfficeRole(), async (_req, res) => {
  const available = await isPlatformIntelligenceAvailable();
  res.json({
    available,
    configured: !!process.env.PLATFORM_INTELLIGENCE_SERVICE_URL,
  });
});

// ─── AI Copilot (streaming) ───────────────────────────────────────────────────

// POST /intelligence/copilot/stream
// Body: {
//   messages: CopilotMessage[],
//   context?: { clientId?: string; portfolioId?: string }
// }
// Returns: SSE stream of { content: string } chunks
router.post('/copilot/stream', requireBackOfficeRole(), async (req, res) => {
  const { messages, context = {} } = req.body as {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    context?: { clientId?: string; portfolioId?: string };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] is required' });
  }

  // Set SSE headers before streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const rmUserId = getAuthenticatedUserId(req) ?? undefined;

  await streamCopilotResponse(
    messages,
    {
      clientId:    context.clientId,
      portfolioId: context.portfolioId,
      rmUserId,
    },
    res,
  );
});

// ─── Morning Briefing ─────────────────────────────────────────────────────────

// GET /intelligence/morning-briefing
// Returns the daily briefing for the authenticated RM.
router.get('/morning-briefing', requireBackOfficeRole(), async (req, res) => {
  try {
    const rmUserId = getAuthenticatedUserId(req);

    if (!rmUserId) {
      return res.status(401).json({ error: 'Numeric user ID not available in authenticated token' });
    }

    const briefing = await getMorningBriefing(rmUserId);

    if (!briefing) {
      return res.status(503).json({
        error: 'Platform intelligence service unavailable',
        configured: !!process.env.PLATFORM_INTELLIGENCE_SERVICE_URL,
      });
    }

    res.json(briefing);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch morning briefing' });
  }
});

// ─── Next Best Actions ────────────────────────────────────────────────────────

// GET /intelligence/nba?limit=10
// Returns ranked NBA actions for the authenticated RM.
router.get('/nba', requireBackOfficeRole(), async (req, res) => {
  try {
    const rmUserId = getAuthenticatedUserId(req);

    if (!rmUserId) {
      return res.status(401).json({ error: 'Numeric user ID not available in authenticated token' });
    }

    const limit = Math.min(
      parseInt(req.query.limit as string ?? '10', 10) || 10,
      50,
    );

    const actions = await getNextBestActions(rmUserId, limit);
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch next best actions' });
  }
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

// GET /intelligence/alerts
// Returns active platform alerts for the authenticated RM.
router.get('/alerts', requireBackOfficeRole(), async (req, res) => {
  try {
    const rmUserId = getAuthenticatedUserId(req);

    if (!rmUserId) {
      return res.status(401).json({ error: 'Numeric user ID not available in authenticated token' });
    }

    const alerts = await getAlerts(rmUserId);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// ─── Call Report Auto-Tagging ─────────────────────────────────────────────────

// POST /intelligence/tag-call-report
// Body: { report_id: number, summary: string, client_id?: string }
// Automatically tags a call report with topics, sentiment, and action items.
router.post('/tag-call-report', requireBackOfficeRole(), async (req, res) => {
  try {
    const { report_id, summary, client_id } = req.body as {
      report_id: number;
      summary:   string;
      client_id?: string;
    };

    if (!report_id || !summary) {
      return res.status(400).json({ error: 'report_id and summary are required' });
    }

    const tags = await tagCallReport(report_id, summary, client_id);

    if (!tags) {
      return res.status(503).json({
        error: 'Platform intelligence service unavailable',
        configured: !!process.env.PLATFORM_INTELLIGENCE_SERVICE_URL,
      });
    }

    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to tag call report' });
  }
});

// ─── Meeting Prep ─────────────────────────────────────────────────────────────

// GET /intelligence/meeting-prep/:meetingId?client_id=CLT-001
// Returns a meeting preparation brief for an upcoming client meeting.
router.get('/meeting-prep/:meetingId', requireBackOfficeRole(), async (req, res) => {
  try {
    const meetingId = parseInt(req.params.meetingId, 10);
    const clientId  = req.query.client_id as string | undefined;
    const rmUserId  = getAuthenticatedUserId(req);

    if (isNaN(meetingId)) {
      return res.status(400).json({ error: 'Invalid meetingId' });
    }

    if (!clientId) {
      return res.status(400).json({ error: 'client_id query parameter is required' });
    }

    if (!rmUserId) {
      return res.status(401).json({ error: 'Numeric user ID not available in authenticated token' });
    }

    const prep = await getMeetingPrep(clientId, rmUserId, meetingId);

    if (!prep) {
      return res.status(503).json({
        error: 'Platform intelligence service unavailable',
        configured: !!process.env.PLATFORM_INTELLIGENCE_SERVICE_URL,
      });
    }

    res.json(prep);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meeting prep' });
  }
});

// ─── Document Ingestion ───────────────────────────────────────────────────────

// POST /intelligence/documents
// Body: {
//   source_type: 'regulatory' | 'research_report' | 'client_email' | 'meeting_note',
//   title: string,
//   text: string,
//   client_ids?: string[],
//   is_shared?: boolean,
// }
router.post('/documents', requireBackOfficeRole(), async (req, res) => {
  try {
    const {
      source_type,
      title,
      text,
      client_ids = [],
      is_shared  = false,
    } = req.body as {
      source_type: string;
      title:       string;
      text:        string;
      client_ids?: string[];
      is_shared?:  boolean;
    };

    if (!source_type || !title || !text) {
      return res.status(400).json({ error: 'source_type, title, and text are required' });
    }

    const result = await ingestDocument(source_type, title, text, client_ids, is_shared);

    if (!result) {
      return res.status(503).json({
        error: 'Platform intelligence service unavailable',
        configured: !!process.env.PLATFORM_INTELLIGENCE_SERVICE_URL,
      });
    }

    res.status(202).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to ingest document' });
  }
});

export default router;
