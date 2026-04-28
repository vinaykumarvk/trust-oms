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
import multer from 'multer';
import { clientPortalService } from '../services/client-portal-service';
import { serviceRequestService } from '../services/service-request-service';
import { srDocumentService } from '../services/sr-document-service';
import { riskProfilingService } from '../services/risk-profiling-service';
import { proposalService } from '../services/proposal-service';
import { clientMessageService } from '../services/client-message-service';
import { statementService } from '../services/statement-service';
import { asyncHandler } from '../middleware/async-handler';
import { validatePortalOwnership } from '../middleware/portal-ownership';
import { ForbiddenError, ValidationError, httpStatusFromError, safeErrorMessage, safeContentDisposition } from '../services/service-errors';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ---------------------------------------------------------------------------
// Portfolio Summary
// ---------------------------------------------------------------------------

/** GET /portfolio-summary/:clientId -- Aggregated portfolio overview */
router.get(
  '/portfolio-summary/:clientId',
  validatePortalOwnership,
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

/** GET /statements/:clientId -- Available statements list (paginated) */
router.get(
  '/statements/:clientId',
  validatePortalOwnership,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;

    if (!clientId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'clientId is required' },
      });
    }

    const rawPage = parseInt(req.query.page as string, 10);
    const rawPageSize = parseInt(req.query.pageSize as string, 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 20 : Math.min(rawPageSize, 100);

    const result = await statementService.getForClient(clientId, { page, pageSize });
    res.json(result);
  }),
);

/** GET /statements/:clientId/:statementId/download -- Download a single statement PDF */
router.get(
  '/statements/:clientId/:statementId/download',
  validatePortalOwnership,
  asyncHandler(async (req, res) => {
    const { clientId, statementId: statementIdRaw } = req.params;
    const statementId = parseInt(statementIdRaw, 10);

    if (isNaN(statementId)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Invalid statement ID' },
      });
    }

    // QUAL-06: always use session-derived clientId for the IDOR guard; never fall back
    // to the URL parameter — validatePortalOwnership above already confirmed they match.
    const sessionClientId = req.clientId as string | undefined;
    if (!sessionClientId) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }

    try {
      const result = await statementService.download(statementId, sessionClientId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${statementId}.pdf"`);
      res.setHeader('X-Delivery-Status', 'AVAILABLE');
      res.send(result.buffer);
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        return res.status(202).json({
          status: 'NOT_AVAILABLE',
          delivery_status: err.message,
          message: 'Statement is being prepared. You will be notified when it is ready.',
        });
      }
      if (err instanceof ForbiddenError) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: safeErrorMessage(err) },
        });
      }
      res.status(httpStatusFromError(err)).json({ error: { message: safeErrorMessage(err) } });
    }
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
  validatePortalOwnership,
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
  validatePortalOwnership,
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
  validatePortalOwnership,
  asyncHandler(async (req, res) => {
    const result = await serviceRequestService.getActionCount(req.params.clientId);
    res.json({ data: result });
  }),
);

/** POST /service-requests — Create new SR */
router.post(
  '/service-requests',
  asyncHandler(async (req, res) => {
    // SEC-03: always use session-derived clientId; never accept client_id from body
    const clientId = req.clientId as string | undefined;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }
    const { sr_type, sr_details, priority, remarks, documents } = req.body;
    if (!sr_type) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'sr_type is required' },
      });
    }
    const userId = String(req.userId || clientId);
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

// ---------------------------------------------------------------------------
// Helper: assert the SR identified by numeric `id` belongs to the
// requesting client.  Returns the SR on success; sends 403/404 and returns
// null on failure.  Callers must guard on `null` before continuing.
// ---------------------------------------------------------------------------
async function assertSROwnership(
  req: any,
  res: any,
  id: number,
): Promise<{ id: number; client_id: string; [key: string]: unknown } | null> {
  const sessionClientId = req.clientId as string | undefined;
  if (!sessionClientId) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    return null;
  }
  const sr = await serviceRequestService.getServiceRequestById(id);
  if (!sr) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service request not found' } });
    return null;
  }
  if (sr.client_id !== sessionClientId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return null;
  }
  return sr;
}

/** PUT /service-requests/:id — Update fields (status-aware) */
router.put(
  '/service-requests/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    // SEC-04: ownership check before mutation
    const sr = await assertSROwnership(req, res, id);
    if (!sr) return;
    const userId = String(req.userId || req.clientId || 'unknown');
    const result = await serviceRequestService.updateServiceRequest(id, req.body, userId);
    res.json({ data: result });
  }),
);

/** PUT /service-requests/:id/close — Close with reason */
router.put(
  '/service-requests/:id/close',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'reason is required' } });
    }
    // SEC-05: ownership check before mutation
    const sr = await assertSROwnership(req, res, id);
    if (!sr) return;
    const userId = String(req.userId || req.clientId || 'unknown');
    const result = await serviceRequestService.closeRequest(id, reason, userId);
    res.json({ data: result });
  }),
);

/** PUT /service-requests/:id/resubmit — Re-send for verification (from INCOMPLETE) */
router.put(
  '/service-requests/:id/resubmit',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    // SEC-06: ownership check before mutation
    const sr = await assertSROwnership(req, res, id);
    if (!sr) return;
    const userId = String(req.userId || req.clientId || 'unknown');
    const result = await serviceRequestService.resubmitForVerification(id, req.body, userId);
    res.json({ data: result });
  }),
);

/** GET /service-requests/:id/history — Status history timeline */
router.get(
  '/service-requests/:id/history',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    // SEC-07: ownership check before exposing history
    const sr = await assertSROwnership(req, res, id);
    if (!sr) return;
    const history = await serviceRequestService.getStatusHistory(id);
    res.json({ data: history });
  }),
);

// ---------------------------------------------------------------------------
// Service Request Documents (Phase 3B)
// ---------------------------------------------------------------------------

/** POST /service-requests/:id/documents — Upload a document */
router.post(
  '/service-requests/:id/documents',
  // Wrap multer to intercept LIMIT_FILE_SIZE and return 413 with structured body
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err && typeof err === 'object' && (err as any).code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: { code: 'FILE_TOO_LARGE', message: 'File must not exceed 20MB' },
        });
      }
      next(err);
    });
  },
  asyncHandler(async (req, res) => {
    const srId = parseInt(req.params.id, 10);
    if (isNaN(srId)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    if (!req.file) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'file is required (multipart field: file)' } });
    }
    const uploadedById = parseInt(String(req.userId ?? '0'), 10) || 0;
    const uploadedByType = req.clientId ? 'CLIENT' : 'RM';
    const { document_class } = req.body;
    try {
      const doc = await srDocumentService.upload(srId, req.file, uploadedByType, uploadedById, document_class);
      res.status(201).json({ data: doc });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

/** GET /service-requests/:id/documents — List documents for an SR */
router.get(
  '/service-requests/:id/documents',
  asyncHandler(async (req, res) => {
    const srId = parseInt(req.params.id, 10);
    if (isNaN(srId)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid service request ID' } });
    }
    // SEC-02: verify the SR belongs to the requesting client before listing its documents
    const sr = await assertSROwnership(req, res, srId);
    if (!sr) return;
    const docs = await srDocumentService.list(srId);
    res.json({ data: docs });
  }),
);

/** GET /service-requests/:id/documents/:docId/download — Download a document */
router.get(
  '/service-requests/:id/documents/:docId/download',
  asyncHandler(async (req, res) => {
    const docId = parseInt(req.params.docId, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid document ID' } });
    }
    const requesterClientId = req.clientId as string | undefined;
    try {
      const { buffer, document } = await srDocumentService.download(docId, requesterClientId);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', safeContentDisposition(document.document_name));
      res.send(buffer);
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

// ---------------------------------------------------------------------------
// Risk Profile (Client View)
// ---------------------------------------------------------------------------

/** GET /risk-profile/:clientId — Active profile + allocation + history */
router.get(
  '/risk-profile/:clientId',
  validatePortalOwnership,
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
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Client identity required' },
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
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Client identity required' },
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
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Client identity required' },
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
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Client identity required' },
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
    const clientId = req.clientId;
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
    const clientId = req.clientId;
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
    if (!clientLead) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No lead record associated with this client' } });
    }
    const resolvedLeadId = clientLead.id;

    // Verify this client's lead is in the communication's recipient list (IDOR guard)
    if (comm.recipient_list_id) {
      const [membership] = await db
        .select({ id: schema.leadListMembers.id })
        .from(schema.leadListMembers)
        .where(and(
          eq(schema.leadListMembers.lead_list_id, comm.recipient_list_id),
          eq(schema.leadListMembers.lead_id, resolvedLeadId),
        ))
        .limit(1);
      if (!membership) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a recipient of this communication' } });
      }
    }

    // BRD G-038: enforce RSVP cutoff — block changes within 2 days of event_date
    const [campaign] = await db
      .select({ event_date: schema.campaigns.event_date })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, comm.campaign_id))
      .limit(1);
    if (campaign?.event_date) {
      const cutoff = new Date(campaign.event_date);
      cutoff.setDate(cutoff.getDate() - 2);
      if (new Date() >= cutoff) {
        return res.status(400).json({
          error: { code: 'RSVP_CLOSED', message: 'RSVP changes are not accepted within 2 days of the event date' },
        });
      }
    }

    // BR1: One response per lead per campaign — upsert to overwrite prior response
    if (resolvedLeadId && comm.campaign_id) {
      const [existingResp] = await db
        .select({ id: schema.campaignResponses.id })
        .from(schema.campaignResponses)
        .where(and(
          eq(schema.campaignResponses.campaign_id, comm.campaign_id),
          eq(schema.campaignResponses.lead_id, resolvedLeadId),
          eq(schema.campaignResponses.is_deleted, false),
        ))
        .limit(1);
      if (existingResp) {
        await db.update(schema.campaignResponses)
          .set({
            response_type: rsvp_status === 'ACCEPTED' ? 'INTERESTED' : rsvp_status === 'DECLINED' ? 'NOT_INTERESTED' : 'MAYBE',
            response_notes: note || null,
            updated_at: new Date(),
          } as any)
          .where(eq(schema.campaignResponses.id, existingResp.id));
        const [updated] = await db.select().from(schema.campaignResponses).where(eq(schema.campaignResponses.id, existingResp.id));
        return res.json({ data: updated });
      }
    }

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
    const clientId = req.clientId;
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
    const clientId = req.clientId;
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
    const clientId = req.clientId;
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
    const clientId = req.clientId;
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

// ---------------------------------------------------------------------------
// Client Messages
// ---------------------------------------------------------------------------

/** GET /messages -- Paginated inbox for the authenticated client */
router.get(
  '/messages',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }

    const { page, pageSize } = req.query;
    const result = await clientMessageService.listForClient(clientId, {
      page: page ? (parseInt(page as string, 10) || 1) : 1,
      pageSize: pageSize ? (parseInt(pageSize as string, 10) || 20) : 20,
    });

    res.json(result);
  }),
);

/** GET /messages/unread-count -- Count of unread messages for the authenticated client */
router.get(
  '/messages/unread-count',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }

    try {
      const unread_count = await clientMessageService.getUnreadCount(clientId);
      res.json({ unread_count });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

/** POST /messages -- Client sends a new message to their RM */
router.post(
  '/messages',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }

    const userId = req.userId;
    const { subject, body, thread_id, parent_message_id, related_sr_id } = req.body;

    try {
      const message = await clientMessageService.create({
        sender_type: 'CLIENT',
        sender_id: Number(userId) || 1,
        recipient_client_id: clientId,
        subject,
        body,
        thread_id: thread_id ?? null,
        parent_message_id: parent_message_id ? Number(parent_message_id) : null,
        related_sr_id: related_sr_id ? Number(related_sr_id) : null,
      });

      res.status(201).json({ data: message });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

/** PATCH /messages/:id/read -- Mark a message as read (IDOR-safe) */
router.patch(
  '/messages/:id/read',
  asyncHandler(async (req: any, res: any) => {
    const clientId = req.clientId;
    if (!clientId) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid message ID' } });
    }

    try {
      await clientMessageService.markRead(id, clientId);
      res.json({ success: true });
    } catch (err: unknown) {
      const status = httpStatusFromError(err);
      res.status(status).json({ error: safeErrorMessage(err) });
    }
  }),
);

export default router;
