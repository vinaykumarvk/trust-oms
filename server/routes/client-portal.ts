/**
 * Client Portal API Routes (Phase 5C)
 *
 * Self-service endpoints for the client-facing portal:
 *   GET  /api/v1/client-portal/portfolio-summary/:clientId  -- Portfolio summary
 *   GET  /api/v1/client-portal/allocation/:portfolioId      -- Asset allocation
 *   GET  /api/v1/client-portal/performance/:portfolioId     -- Performance (TWR/IRR)
 *   GET  /api/v1/client-portal/holdings/:portfolioId        -- Detailed holdings
 *   GET  /api/v1/client-portal/transactions/:portfolioId    -- Recent transactions
 *   GET  /api/v1/client-portal/statements/:clientId         -- Available statements
 *   POST /api/v1/client-portal/request-action               -- Request an action
 *   GET  /api/v1/client-portal/notifications/:clientId      -- Notifications
 */

import { Router } from 'express';
import { clientPortalService } from '../services/client-portal-service';
import { serviceRequestService } from '../services/service-request-service';
import { riskProfilingService } from '../services/risk-profiling-service';
import { proposalService } from '../services/proposal-service';
import { asyncHandler } from '../middleware/async-handler';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// ---------------------------------------------------------------------------
// Portfolio Summary
// ---------------------------------------------------------------------------

/** GET /portfolio-summary/:clientId -- Aggregated portfolio overview */
router.get(
  '/portfolio-summary/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getPortfolioSummary(clientId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** GET /allocation/:portfolioId -- Asset allocation breakdown */
router.get(
  '/allocation/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getAllocation(portfolioId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/** GET /performance/:portfolioId?period=1Y -- TWR / IRR performance */
router.get(
  '/performance/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const period = (req.query.period as string) || '1Y';

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getPerformance(portfolioId, period);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

/** GET /holdings/:portfolioId -- Detailed position list */
router.get(
  '/holdings/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getHoldings(portfolioId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Recent Transactions
// ---------------------------------------------------------------------------

/** GET /transactions/:portfolioId -- Recent transactions */
router.get(
  '/transactions/:portfolioId',
  asyncHandler(async (req, res) => {
    const { portfolioId } = req.params;
    const limit = parseInt(String(req.query.limit ?? '20'), 10);

    if (!portfolioId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'portfolioId is required' },
      });
    }

    const data = await clientPortalService.getRecentTransactions(
      portfolioId,
      Number.isNaN(limit) ? 20 : limit,
    );
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

/** GET /statements/:clientId -- Available statements list */
router.get(
  '/statements/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const period = req.query.period as string | undefined;

    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getStatements(clientId, period);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Action Request
// ---------------------------------------------------------------------------

/** POST /request-action -- Submit a client action request */
router.post(
  '/request-action',
  asyncHandler(async (req, res) => {
    const { clientId, actionType, details } = req.body;

    if (!clientId || !actionType) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'clientId and actionType are required',
        },
      });
    }

    const data = await clientPortalService.requestAction(
      clientId,
      actionType,
      details ?? {},
    );
    res.status(201).json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** GET /notifications/:clientId -- Client notifications */
router.get(
  '/notifications/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const data = await clientPortalService.getNotifications(clientId);
    res.json({ data });
  }),
);

// ---------------------------------------------------------------------------
// Service Requests
// ---------------------------------------------------------------------------

/** GET /service-requests/:clientId — List with status/priority/search filters */
router.get(
  '/service-requests/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const { status, priority, search, page, pageSize } = req.query;
    const result = await serviceRequestService.getServiceRequests({
      client_id: clientId,
      status: status as string,
      priority: priority as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });
    res.json(result);
  }),
);

/** GET /service-requests/action-count/:clientId — Count of INCOMPLETE SRs for badge */
router.get(
  '/service-requests/action-count/:clientId',
  asyncHandler(async (req, res) => {
    const result = await serviceRequestService.getActionCount(req.params.clientId);
    res.json({ data: result });
  }),
);

/** POST /service-requests — Create new SR */
router.post(
  '/service-requests',
  asyncHandler(async (req, res) => {
    const clientId = (req as any).user?.clientId || req.body.client_id;
    const { sr_type, sr_details, priority, remarks, documents } = req.body;
    if (!clientId || !sr_type) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'client_id and sr_type are required' },
      });
    }
    const userId = String((req as any).user?.id || (req as any).user?.clientId || clientId);
    const result = await serviceRequestService.createServiceRequest({
      client_id: clientId,
      sr_type,
      sr_details,
      priority,
      remarks,
      documents,
      created_by: userId,
    });
    res.status(201).json({ data: result });
  }),
);

/** GET /service-requests/detail/:id — Single SR detail */
router.get(
  '/service-requests/detail/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const sr = await serviceRequestService.getServiceRequestById(id);
    if (!sr) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service request not found' } });
    }
    res.json({ data: sr });
  }),
);

/** PUT /service-requests/:id — Update fields (status-aware) */
router.put(
  '/service-requests/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const userId = String((req as any).user?.id || (req as any).user?.clientId || 'unknown');
    const result = await serviceRequestService.updateServiceRequest(id, req.body, userId);
    res.json({ data: result });
  }),
);

/** PUT /service-requests/:id/close — Close with reason */
router.put(
  '/service-requests/:id/close',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'reason is required' } });
    }
    const userId = String((req as any).user?.id || (req as any).user?.clientId || 'unknown');
    const result = await serviceRequestService.closeRequest(id, reason, userId);
    res.json({ data: result });
  }),
);

/** PUT /service-requests/:id/resubmit — Re-send for verification (from INCOMPLETE) */
router.put(
  '/service-requests/:id/resubmit',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const userId = String((req as any).user?.id || (req as any).user?.clientId || 'unknown');
    const result = await serviceRequestService.resubmitForVerification(id, req.body, userId);
    res.json({ data: result });
  }),
);

/** GET /service-requests/:id/history — Status history timeline */
router.get(
  '/service-requests/:id/history',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const history = await serviceRequestService.getStatusHistory(id);
    res.json({ data: history });
  }),
);

// ---------------------------------------------------------------------------
// Risk Profile (Client View)
// ---------------------------------------------------------------------------

/** GET /risk-profile/:clientId — Active profile + allocation + history */
router.get(
  '/risk-profile/:clientId',
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const profile = await riskProfilingService.getCustomerRiskProfile(clientId);
    const history = await riskProfilingService.listCustomerAssessments(clientId);

    // If there's an active profile, try to get the recommended allocation
    let allocation: any[] = [];
    if (profile) {
      const category = profile.overridden_category || profile.risk_category;
      try {
        const config = await riskProfilingService.getAssetAllocationByCategory(category);
        allocation = config?.lines ?? [];
      } catch {
        // No allocation config for this category — return empty
      }
    }

    res.json({ data: { profile, allocation, history } });
  }),
);

// ---------------------------------------------------------------------------
// Investment Proposals (Client View)
// ---------------------------------------------------------------------------

/** GET /proposals — List proposals for the authenticated client (session-derived) */
router.get(
  '/proposals',
  asyncHandler(async (req, res) => {
    const clientId = req.userId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const proposals = await proposalService.listProposals({
      customerId: clientId,
    });
    res.json({ data: { proposals } });
  }),
);

/** GET /proposals/detail/:id — Single proposal with ownership check */
router.get(
  '/proposals/detail/:id',
  asyncHandler(async (req, res) => {
    const clientId = req.userId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Valid proposal id is required' },
      });
    }

    const proposal = await proposalService.getProposal(id);
    if (!proposal) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Proposal not found' },
      });
    }
    // IDOR guard: only the proposal's customer may view it
    if (proposal.customer_id !== clientId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }
    res.json({ data: { proposal } });
  }),
);

/** POST /proposals/:id/accept — Client accepts proposal (ownership verified) */
router.post(
  '/proposals/:id/accept',
  asyncHandler(async (req, res) => {
    const clientId = req.userId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Valid proposal id is required' },
      });
    }

    // IDOR guard: verify ownership before mutating
    const proposal = await proposalService.getProposal(id);
    if (!proposal || proposal.customer_id !== clientId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const result = await proposalService.clientAccept(id, 0);
    res.json({ data: result });
  }),
);

/** POST /proposals/:id/reject — Client rejects proposal (ownership verified) */
router.post(
  '/proposals/:id/reject',
  asyncHandler(async (req, res) => {
    const clientId = req.userId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Valid proposal id is required' },
      });
    }

    // IDOR guard: verify ownership before mutating
    const proposal = await proposalService.getProposal(id);
    if (!proposal || proposal.customer_id !== clientId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const { reason } = req.body;
    const result = await proposalService.clientReject(id, 0, reason);
    res.json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// Campaign Inbox
// ---------------------------------------------------------------------------

/** GET /campaign-inbox -- Campaigns targeted at the authenticated client */
router.get(
  '/campaign-inbox',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.user?.clientId;
    if (!clientId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Client identity required' } });
    }

    // Get communications only for campaigns whose lead lists include this client's leads
    const comms = await db
      .select({
        id: schema.campaignCommunications.id,
        campaign_id: schema.campaignCommunications.campaign_id,
        campaign_name: schema.campaigns.name,
        campaign_type: schema.campaigns.campaign_type,
        channel: schema.campaignCommunications.channel,
        subject: schema.campaignCommunications.subject,
        body: schema.campaignCommunications.body,
        dispatched_at: schema.campaignCommunications.dispatched_at,
        dispatch_status: schema.campaignCommunications.dispatch_status,
        event_name: schema.campaigns.event_name,
        event_date: schema.campaigns.event_date,
        event_venue: schema.campaigns.event_venue,
        brochure_url: schema.campaigns.brochure_url,
      })
      .from(schema.campaignCommunications)
      .innerJoin(schema.campaigns, eq(schema.campaignCommunications.campaign_id, schema.campaigns.id))
      .innerJoin(schema.leadLists, eq(schema.campaignCommunications.recipient_list_id, schema.leadLists.id))
      .innerJoin(schema.leadListMembers, eq(schema.leadLists.id, schema.leadListMembers.lead_list_id))
      .innerJoin(schema.leads, eq(schema.leadListMembers.lead_id, schema.leads.id))
      .where(and(
        eq(schema.campaignCommunications.dispatch_status, 'COMPLETED'),
        eq(schema.leads.existing_client_id, String(clientId)),
      ))
      .orderBy(desc(schema.campaignCommunications.dispatched_at));

    // Count unread if requested
    const unreadCount = req.query.unread_count === 'true' ? comms.length : undefined;

    res.json({ data: comms, total: comms.length, unread_count: unreadCount });
  }),
);

/** POST /campaign-inbox/:commId/rsvp -- RSVP for an event campaign */
router.post(
  '/campaign-inbox/:commId/rsvp',
  asyncHandler(async (req: any, res: any) => {
    const commId = parseInt(req.params.commId, 10);
    const { rsvp_status, note } = req.body;
    const clientId = req.user?.clientId;
    if (!clientId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Client identity required' } });
    }

    if (!rsvp_status || !['ACCEPTED', 'DECLINED', 'TENTATIVE', 'PENDING'].includes(rsvp_status)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'rsvp_status must be ACCEPTED, DECLINED, TENTATIVE, or PENDING' },
      });
    }

    // Get the communication to find the campaign
    const [comm] = await db
      .select()
      .from(schema.campaignCommunications)
      .where(eq(schema.campaignCommunications.id, commId));
    if (!comm) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Communication not found' } });
    }

    // Resolve lead_id from clientId
    const [clientLead] = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(eq(schema.leads.existing_client_id, String(clientId)))
      .limit(1);
    const resolvedLeadId = clientLead?.id || 0;

    // Record the response
    const [response] = await db
      .insert(schema.campaignResponses)
      .values({
        campaign_id: comm.campaign_id,
        lead_id: resolvedLeadId,
        response_type: rsvp_status === 'ACCEPTED' ? 'INTERESTED' : rsvp_status === 'DECLINED' ? 'NOT_INTERESTED' : 'MAYBE',
        response_notes: note || null,
        response_channel: 'PORTAL',
      })
      .returning();

    res.json({ data: response });
  }),
);

// ---------------------------------------------------------------------------
// Client Meetings
// ---------------------------------------------------------------------------

/** GET /meetings -- Upcoming meetings for the authenticated client */
router.get(
  '/meetings',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.user?.clientId;
    if (!clientId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Client identity required' } });
    }

    const meetings = await db
      .select()
      .from(schema.meetings)
      .where(
        and(
          clientId ? eq(schema.meetings.client_id, clientId) : undefined,
          eq(schema.meetings.meeting_status, 'SCHEDULED'),
        ),
      )
      .orderBy(schema.meetings.start_time);

    res.json({ data: meetings, total: meetings.length });
  }),
);

// ---------------------------------------------------------------------------
// Consent Self-Service
// ---------------------------------------------------------------------------

const VALID_CONSENT_TYPES = ['MARKETING_EMAIL', 'MARKETING_SMS', 'MARKETING_PUSH', 'ANALYTICS'];
const VALID_CONSENT_STATUSES = ['OPTED_IN', 'OPTED_OUT', 'PENDING'];

/** GET /consent/preferences -- Client consent preferences */
router.get(
  '/consent/preferences',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.user?.clientId;
    if (!clientId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Client identity required' } });
    }

    const consents = await db
      .select()
      .from(schema.campaignConsentLog)
      .where(eq(schema.campaignConsentLog.client_id, clientId))
      .orderBy(desc(schema.campaignConsentLog.effective_date));

    res.json({ data: consents });
  }),
);

/** PATCH /consent/preferences -- Update consent preferences */
router.patch(
  '/consent/preferences',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.user?.clientId;
    const { consent_type, consent_status } = req.body;

    if (!clientId || !consent_type || !consent_status) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'client_id, consent_type, and consent_status are required' },
      });
    }

    if (!VALID_CONSENT_TYPES.includes(consent_type)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `consent_type must be one of: ${VALID_CONSENT_TYPES.join(', ')}` },
      });
    }

    if (!VALID_CONSENT_STATUSES.includes(consent_status)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `consent_status must be one of: ${VALID_CONSENT_STATUSES.join(', ')}` },
      });
    }

    const [record] = await db
      .insert(schema.campaignConsentLog)
      .values({
        client_id: clientId,
        consent_type,
        consent_status,
        consent_source: 'PORTAL_SELF_SERVICE',
      })
      .returning();

    res.json({ data: record });
  }),
);

/** POST /consent/opt-out -- Quick opt-out for a specific consent type */
router.post(
  '/consent/opt-out',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.user?.clientId;
    const { consent_type } = req.body;

    if (!clientId || !consent_type) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'client_id and consent_type are required' },
      });
    }

    if (!VALID_CONSENT_TYPES.includes(consent_type)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: `consent_type must be one of: ${VALID_CONSENT_TYPES.join(', ')}` },
      });
    }

    const [record] = await db
      .insert(schema.campaignConsentLog)
      .values({
        client_id: clientId,
        consent_type,
        consent_status: 'OPTED_OUT',
        consent_source: 'PORTAL_SELF_SERVICE',
        revoked_at: new Date(),
      })
      .returning();

    res.json({ data: record });
  }),
);

export default router;
