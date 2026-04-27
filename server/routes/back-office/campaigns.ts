/**
 * Campaign Management — Custom Routes
 *
 * Domain-specific endpoints beyond standard CRUD:
 * - Campaign lifecycle (submit, approve, copy, analytics)
 * - Lead list operations (rule execution, merge)
 * - Campaign dispatch (email)
 * - Unified interaction logger
 * - Lead-to-prospect conversion
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireCRMRole, requireAnyRole, denyBusinessApproval, logDataAccess } from '../../middleware/role-auth';

const bulkUploadLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: { code: 'RATE_LIMITED', message: 'Too many bulk upload requests. Try again later.' } } });
import { db } from '../../db';
import { conversionHistory, leads, prospects, opportunities } from '@shared/schema';
import { eq, and, gte, lte, count, desc } from 'drizzle-orm';
import {
  campaignService,
  leadListService,
  campaignDispatchService,
  interactionService,
  prospectService,
  validateResponseModification,
} from '../../services/campaign-service';
import { leadRuleService } from '../../services/lead-rule-service';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseId(val: string): number {
  const id = parseInt(val, 10);
  if (Number.isNaN(id) || id <= 0) throw new Error('Invalid ID parameter');
  return id;
}

function httpStatus(err: unknown): number {
  const msg = errMsg(err).toLowerCase();
  if (msg.includes('not found')) return 404;
  if (msg.includes('invalid id')) return 400;
  return 400; // validation errors stay 400
}

const router = Router();
router.use(requireCRMRole());

// ============================================================================
// Campaign Lifecycle
// ============================================================================

/** Submit campaign for approval */
router.post('/campaigns/:id/submit', async (req, res) => {
  try {
    const result = await campaignService.submit(parseId(req.params.id), req.userId ?? '');
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Approve campaign */
router.post('/campaigns/:id/approve',
  denyBusinessApproval(),
  requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const result = await campaignService.approve(
        parseId(req.params.id),
        req.userId ?? '' ?? '',
      );
      res.json({ data: result });
    } catch (e: unknown) {
      res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
    }
  },
);

/** Reject campaign */
router.post('/campaigns/:id/reject',
  denyBusinessApproval(),
  requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'reason is required for rejection' },
        });
      }
      const result = await campaignService.reject(
        parseId(req.params.id),
        req.userId ?? '' ?? '',
        reason,
      );
      res.json({ data: result });
    } catch (e: unknown) {
      res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
    }
  },
);

/** Reset REJECTED campaign to DRAFT — BRD G-013 */
router.post('/campaigns/:id/reset-to-draft', async (req, res) => {
  try {
    const result = await campaignService.resetToDraft(
      parseId(req.params.id),
      req.userId ?? '',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Copy campaign */
router.post('/campaigns/:id/copy', async (req, res) => {
  try {
    const result = await campaignService.copyCampaign(
      parseId(req.params.id),
      req.userId ?? '' ?? '',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Campaign analytics */
router.get('/campaigns/:id/analytics', async (req, res) => {
  try {
    const result = await campaignService.getAnalytics(parseId(req.params.id));
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'NOT_FOUND', message: errMsg(e) } });
  }
});

/** Dashboard stats */
router.get('/campaign-dashboard/stats', async (_req, res) => {
  try {
    const result = await campaignService.getDashboardStats();
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

/** G-003: Dry-run preview for lead list rule — returns estimated audience count without writing to DB */
router.post('/lead-lists/preview', async (req, res) => {
  try {
    const { rules } = req.body;
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'rules must be a CriteriaNode object' } });
    }
    // Reuse the existing rule preview engine via leadRuleService
    const result = await leadRuleService.previewMatchCount(rules);
    res.json({ data: { estimated_count: result.count } });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Rule dry-run / preview — BRD CAMP-002 */
router.post('/lead-rules/preview', async (req, res) => {
  try {
    const { criteria_json } = req.body;
    if (!criteria_json) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'criteria_json is required' } });
    }
    const result = await leadRuleService.previewMatchCount(criteria_json);
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** G-008: Human-readable criteria expression preview */
router.post('/lead-rules/criteria-preview', async (req, res) => {
  try {
    const { criteria_json } = req.body;
    if (!criteria_json) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'criteria_json is required' } });
    }
    const result = leadRuleService.getCriteriaPreview(criteria_json);
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** RM Scorecards — BRD CAMP-033 */
router.get('/campaign-dashboard/rm-scorecards', async (_req, res) => {
  try {
    const result = await campaignService.getRmScorecards();
    res.json(result);
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

/** Paginated campaign responses with lead details */
router.get('/campaigns/:id/responses', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const result = await campaignService.listResponses(
      parseId(req.params.id),
      page,
      Math.min(pageSize, 100),
    );
    res.json(result);
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** PATCH /campaign-responses/:id — BRD G-022: validate modification window before update */
router.patch('/campaign-responses/:id', async (req, res) => {
  try {
    const responseId = parseId(req.params.id);
    const userRole = (req as any).userRole || 'RELATIONSHIP_MANAGER';
    await validateResponseModification(responseId, userRole);

    // Allowlist only safe fields
    const allowed = ['response_type', 'response_notes', 'response_channel', 'follow_up_required', 'follow_up_date'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No updatable fields provided' } });
    }

    const { db } = await import('../../db');
    const { campaignResponses } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const [updated] = await db.update(campaignResponses).set({ ...update, updated_at: new Date() } as any)
      .where(eq(campaignResponses.id, responseId)).returning();
    res.json({ data: updated });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Lead List Operations
// ============================================================================

/** Delete lead list — G-14: blocked if attached to an active campaign */
router.delete('/lead-lists/:id', async (req, res) => {
  try {
    await leadListService.deleteList(parseId(req.params.id), req.userId ?? '');
    console.info(JSON.stringify({ action: 'lead-list-deleted', actor: req.userId ?? '', list_id: req.params.id }));
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Execute rule-based lead list */
router.post('/lead-lists/:id/refresh', async (req, res) => {
  try {
    const result = await leadListService.executeRule(parseId(req.params.id));
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Merge multiple lead lists */
router.post('/lead-lists/merge', async (req, res) => {
  try {
    const { list_ids, name } = req.body;
    if (!list_ids || !Array.isArray(list_ids) || list_ids.length < 2) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'At least 2 list IDs required' } });
    }
    const result = await leadListService.mergeLists(list_ids, name || 'Merged List', req.userId ?? '');
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Copy lead list — BRD CAMP-007 */
router.post('/lead-lists/:id/copy', async (req, res) => {
  try {
    const sourceId = parseId(req.params.id);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
    }
    const result = await leadListService.copyList(sourceId, name.trim(), req.userId ?? '');
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Campaign Dispatch
// ============================================================================

/** Dispatch campaign communication */
router.post('/campaigns/:id/dispatch',
  logDataAccess('campaign-dispatch'),
  requireAnyRole('BO_MAKER', 'BO_HEAD', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { channel, template_id, recipient_list_id, scheduled_at } = req.body;
      if (!channel || !template_id || !recipient_list_id) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'channel, template_id, and recipient_list_id are required' },
        });
      }
      const result = await campaignDispatchService.dispatch(
        parseId(req.params.id),
        channel,
        template_id,
        recipient_list_id,
        req.userId ?? '' ?? '',
        scheduled_at ? new Date(scheduled_at) : undefined,
      );
      res.status(201).json({ data: result });
    } catch (e: unknown) {
      res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
    }
  },
);

// ============================================================================
// Unified Interaction Logger
// ============================================================================

/** Log a complete interaction (response + action item + meeting) atomically */
router.post('/interactions', async (req, res) => {
  try {
    const { lead_id, campaign_id, response, action_item, meeting } = req.body;
    if (!lead_id) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lead_id is required' } });
    }
    if (!response) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'response is required' } });
    }
    const result = await interactionService.logInteraction(
      { lead_id, campaign_id, response, action_item, meeting },
      req.userId ?? '' ?? '',
    );
    res.status(201).json({ data: result, message: 'Interaction logged successfully' });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Lead-to-Prospect Conversion
// ============================================================================

/** Convert a lead to a prospect */
router.post('/leads/:id/convert', logDataAccess('lead-conversion'), async (req, res) => {
  try {
    const { additional_fields } = req.body;
    if (
      additional_fields !== undefined &&
      additional_fields !== null &&
      (typeof additional_fields !== 'object' || Array.isArray(additional_fields))
    ) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'additional_fields must be a plain object' } });
    }
    const safeFields: Record<string, unknown> = additional_fields != null ? (additional_fields as Record<string, unknown>) : {};
    const result = await prospectService.convertLeadToProspect(
      parseId(req.params.id),
      safeFields,
      req.userId ?? '' ?? '',
    );
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Call Report Lifecycle
// ============================================================================

/** Submit call report for approval */
router.post('/call-reports/:id/submit', async (req, res) => {
  try {
    const result = await campaignService.submitCallReport(
      parseId(req.params.id),
      req.userId ?? '' ?? '',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Approve or reject call report */
router.post('/call-reports/:id/approve',
  denyBusinessApproval(),
  requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { approved, reason, quality_score } = req.body;
      const result = await campaignService.approveCallReport(
        parseId(req.params.id),
        req.userId ?? '' ?? '',
        approved,
        reason,
        quality_score,
      );
      res.json({ data: result });
    } catch (e: unknown) {
      res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
    }
  },
);

// ============================================================================
// Handover Approval
// ============================================================================

/** Approve or reject RM handover */
router.post('/handovers/:id/approve',
  denyBusinessApproval(),
  requireAnyRole('BO_HEAD', 'BO_CHECKER', 'SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { approved, reason } = req.body;
      const result = await campaignService.approveHandover(
        parseId(req.params.id),
        req.userId ?? '' ?? '',
        approved,
        reason,
      );
      res.json({ data: result });
    } catch (e: unknown) {
      res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
    }
  },
);

// ============================================================================
// Lead List Member Management
// ============================================================================

/** Add members to a lead list */
router.post('/lead-lists/:id/members', async (req, res) => {
  try {
    const { lead_ids } = req.body;
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'lead_ids array is required' },
      });
    }
    const result = await leadListService.addMembers(
      parseId(req.params.id),
      lead_ids,
      req.userId ?? '' ?? '',
    );
    console.info(JSON.stringify({ action: 'lead-list-members-added', actor: req.userId ?? '' ?? '', list_id: req.params.id, lead_count: lead_ids.length }));
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Remove a member from a lead list */
router.delete('/lead-lists/:id/members/:leadId', async (req, res) => {
  try {
    const result = await leadListService.removeMember(
      parseId(req.params.id),
      parseId(req.params.leadId),
    );
    console.info(JSON.stringify({ action: 'lead-list-member-removed', actor: req.userId ?? '' ?? '', list_id: req.params.id, lead_id: req.params.leadId }));
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Bulk Lead Upload
// ============================================================================

/** Upload CSV/Excel leads */
router.post('/leads/upload', bulkUploadLimiter, async (req, res) => {
  try {
    const { file_name, file_url, target_list_id, rows } = req.body;
    if (!file_name || !target_list_id || !rows) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'file_name, target_list_id, and rows are required' },
      });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'rows must be a non-empty array' },
      });
    }
    if (rows.length > 10000) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Maximum 10,000 rows per upload. Please split your file.' },
      });
    }
    const invalidRow = rows.find(
      (r: any) => typeof r !== 'object' || r === null || typeof r.first_name !== 'string' || typeof r.last_name !== 'string',
    );
    if (invalidRow !== undefined) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Each row must have first_name and last_name as strings' },
      });
    }
    const result = await leadListService.uploadLeads(
      file_name,
      file_url || '',
      target_list_id,
      rows,
      req.userId ?? '' ?? '',
    );
    console.info(JSON.stringify({ action: 'leads-bulk-uploaded', actor: req.userId ?? '' ?? '', file_name, target_list_id, row_count: Array.isArray(rows) ? rows.length : 0 }));
    res.status(201).json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

/** Get upload batch status */
router.get('/leads/upload/:batchId', async (req, res) => {
  try {
    const result = await leadListService.getUploadBatch(parseId(req.params.batchId));
    if (!result) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Batch not found' } });
    }
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'NOT_FOUND', message: errMsg(e) } });
  }
});

/** CM G-005: Download CSV error report for an upload batch */
router.get('/leads/upload/:batchId/errors.csv', async (req, res) => {
  try {
    const result = await leadListService.getUploadBatchErrorsCsv(parseId(req.params.batchId));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'NOT_FOUND', message: errMsg(e) } });
  }
});

/** Confirm upload batch */
router.post('/leads/upload/:batchId/confirm', async (req, res) => {
  try {
    const result = await leadListService.confirmUploadBatch(
      parseId(req.params.batchId),
      req.userId ?? '' ?? '',
    );
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(httpStatus(e)).json({ error: { code: 'VALIDATION_ERROR', message: errMsg(e) } });
  }
});

// ============================================================================
// Conversion History
// ============================================================================

/** Paginated conversion history with filters */
router.get('/conversion-history', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size as string) || 20, 100);
    const offset = (page - 1) * pageSize;
    const { date_from, date_to, type } = req.query;

    const conditions: ReturnType<typeof eq>[] = [];
    if (date_from) {
      conditions.push(gte(conversionHistory.created_at, new Date(date_from as string)));
    }
    if (date_to) {
      conditions.push(lte(conversionHistory.created_at, new Date(date_to as string)));
    }
    if (type) {
      conditions.push(eq(conversionHistory.source_entity_type, type as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(conversionHistory)
      .where(whereClause);

    const total = Number(totalResult?.count || 0);

    const rows = await db
      .select()
      .from(conversionHistory)
      .where(whereClause)
      .orderBy(desc(conversionHistory.created_at))
      .limit(pageSize)
      .offset(offset);

    res.json({
      data: rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

/** Funnel analytics — conversion funnel stages */
router.get('/conversion-history/funnel', async (_req, res) => {
  try {
    // Total leads
    const [totalLeadsResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.is_deleted, false));
    const totalLeads = Number(totalLeadsResult?.count || 0);

    // Qualified leads
    const [qualifiedResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.lead_status, 'QUALIFIED'));
    const qualifiedLeads = Number(qualifiedResult?.count || 0);

    // Contacted leads
    const [contactedResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.lead_status, 'CONTACTED'));
    const contactedLeads = Number(contactedResult?.count || 0);

    // Converted leads (now prospects)
    const [convertedResult] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.lead_status, 'CONVERTED'));
    const convertedLeads = Number(convertedResult?.count || 0);

    // Total prospects
    const [prospectsResult] = await db
      .select({ count: count() })
      .from(prospects)
      .where(eq(prospects.is_deleted, false));
    const totalProspects = Number(prospectsResult?.count || 0);

    // Won opportunities (fully onboarded)
    const [wonResult] = await db
      .select({ count: count() })
      .from(opportunities)
      .where(eq(opportunities.stage, 'WON'));
    const wonOpportunities = Number(wonResult?.count || 0);

    // Conversion history count by type
    const conversionsByType = await db
      .select({
        source_entity_type: conversionHistory.source_entity_type,
        target_entity_type: conversionHistory.target_entity_type,
        count: count(),
      })
      .from(conversionHistory)
      .groupBy(conversionHistory.source_entity_type, conversionHistory.target_entity_type);

    res.json({
      data: {
        funnel: [
          { stage: 'LEADS', count: totalLeads },
          { stage: 'CONTACTED', count: contactedLeads },
          { stage: 'QUALIFIED', count: qualifiedLeads },
          { stage: 'CONVERTED', count: convertedLeads },
          { stage: 'PROSPECTS', count: totalProspects },
          { stage: 'WON', count: wonOpportunities },
        ],
        conversions_by_type: conversionsByType,
        lead_to_prospect_rate: totalLeads > 0
          ? Math.round((convertedLeads / totalLeads) * 10000) / 100
          : 0,
        prospect_to_won_rate: totalProspects > 0
          ? Math.round((wonOpportunities / totalProspects) * 10000) / 100
          : 0,
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: errMsg(e) } });
  }
});

/** POST /communications/:id/retry — G-018: Retry a failed dispatch */
router.post('/communications/:id/retry', async (req, res) => {
  try {
    const commId = parseId(req.params.id);
    const rawUserId = (req as any).user?.id ?? (req as any).userId;
    const userId = rawUserId ? String(rawUserId) : '';
    if (!userId) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    const result = await campaignDispatchService.retryDispatch(commId, userId);
    res.json(result);
  } catch (e: unknown) {
    const msg = errMsg(e);
    if (msg.includes('not found')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
    if (msg.includes('Maximum retry')) return res.status(422).json({ error: { code: 'MAX_RETRIES_EXCEEDED', message: msg } });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
  }
});

export default router;
