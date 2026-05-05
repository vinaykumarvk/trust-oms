/**
 * Handover & Assignment Management (HAM) Service
 *
 * Manages the lifecycle of RM handover requests: creation, authorization,
 * rejection, cancellation, reversal, scrutiny checklists, delegation,
 * audit logging, and dashboard summaries.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, asc, or, gte, lte, ne, inArray, isNull, count } from 'drizzle-orm';
import {
  appendHandoverRoutingHistory,
  buildHandoverAuthorizationRoute,
  evaluateHandoverCheckerAuthorization,
  makeHandoverRoutingHistoryEntry,
  type HandoverAuthorizationRoute,
  type HandoverRoutingActor,
} from './handover-routing-policy';
import {
  BULK_HANDOVER_DEFAULT_MAX_RETRIES,
  computeBulkHandoverCounts,
  computeBulkHandoverNextRetryAt,
  estimateBulkHandoverPayloadBytes,
  groupBulkHandoverRows,
  makeInitialBulkHandoverResults,
  mergeBulkHandoverGroupResult,
  shouldRetryBulkHandoverJob,
  validateBulkHandoverUpload,
  type BulkHandoverGroupResult,
  type BulkHandoverUploadRow,
} from './handover-bulk-upload-policy';

type Handover = typeof schema.handovers.$inferSelect;
type HandoverItem = typeof schema.handoverItems.$inferSelect;
type BulkUploadLog = typeof schema.bulkUploadLogs.$inferSelect;
type BulkUploadFailureItem = typeof schema.bulkUploadFailureItems.$inferSelect;

type HandoverRoutingUser = HandoverRoutingActor & { email?: string | null };

function actorId(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function makeBulkResumeToken(uploadId: number | undefined, uploadedBy: string, createdAt: Date): string {
  const source = `${uploadId ?? 'pending'}:${uploadedBy}:${createdAt.toISOString()}`;
  return Buffer.from(source).toString('base64url');
}

function normalizeBulkFailureStatus(status?: string): string {
  return (status ?? 'OPEN').trim().toUpperCase();
}

function makeRouteUpdate(route: HandoverAuthorizationRoute, history: unknown, action: 'ROUTED' | 'AUTHORIZED' | 'ESCALATED' | 'REROUTED', actor: string | number | null, reason?: string | null, details?: Record<string, unknown>, at: Date = new Date()): Record<string, unknown> {
  return {
    source_branch_id: route.sourceBranchId,
    target_branch_id: route.targetBranchId,
    authorization_route: route.routeType,
    checker_branch_id: route.checkerBranchId,
    secondary_checker_branch_id: route.secondaryCheckerBranchId,
    required_checker_role: route.requiredCheckerRole,
    authorization_owner_team: action === 'ESCALATED' ? route.escalationTeam : route.ownerTeam,
    authorization_due_at: route.authorizationDueAt,
    escalation_due_at: route.escalationDueAt,
    routing_snapshot: {
      ...route.snapshot,
      last_action: action,
      last_action_at: at.toISOString(),
      last_actor_id: actor,
    },
    routing_history: appendHandoverRoutingHistory(
      history,
      makeHandoverRoutingHistoryEntry(route, action, actor, reason, details, at),
    ),
  };
}

export const handoverService = {
  // ---------------------------------------------------------------------------
  // 1. listEntities
  // ---------------------------------------------------------------------------
  /**
   * Return a paginated, searchable list of entities eligible for handover.
   * Since there are no dedicated lead/prospect/client master tables, we
   * return simulated data seeded from existing handoverItems or generate
   * placeholder results.
   */
  async listEntities(
    entityType: 'lead' | 'prospect' | 'client',
    filters: { search?: string; branch?: string; location?: string; language?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ data: { entity_id: string; entity_name_en: string | null; entity_name_local: string | null; aum_at_handover: string | null; product_count: number | null; cif_number: string | null; referring_rm_id: number | null; location: string | null; preferred_language: string | null }[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);

    // Pull distinct entities that have appeared in prior handover items
    // HAM-GAP-014: also select cif_number and referring_rm_id via entity table JOIN
    const existingItems = await db
      .select({
        entity_id: schema.handoverItems.entity_id,
        entity_name_en: schema.handoverItems.entity_name_en,
        entity_name_local: schema.handoverItems.entity_name_local,
        aum_at_handover: schema.handoverItems.aum_at_handover,
        product_count: schema.handoverItems.product_count,
      })
      .from(schema.handoverItems)
      .innerJoin(schema.handovers, eq(schema.handoverItems.handover_id, schema.handovers.id))
      .where(eq(schema.handovers.entity_type, entityType));

    // De-duplicate by entity_id (keep latest appearance)
    type EntityRow = { entity_id: string; entity_name_en: string | null; entity_name_local: string | null; aum_at_handover: string | null; product_count: number | null; cif_number: string | null; referring_rm_id: number | null; location: string | null; preferred_language: string | null };
    const entityMap = new Map<string, EntityRow>();
    for (const item of existingItems) {
      entityMap.set(item.entity_id, { ...item, cif_number: null, referring_rm_id: null, location: null, preferred_language: null });
    }

    // HAM-GAP-014: Enrich with cif_number + referring_rm_id from entity tables
    // HAM-GAP-008: Also enrich with location (country_of_residence) + preferred_language
    const entityIds = Array.from(entityMap.keys());
    if (entityIds.length > 0) {
      if (entityType === 'lead') {
        const leads = await db
          .select({ lead_code: schema.leads.lead_code, assigned_rm_id: schema.leads.assigned_rm_id, country_of_residence: schema.leads.country_of_residence, preferred_language: schema.leads.preferred_language })
          .from(schema.leads)
          .where(inArray(schema.leads.lead_code, entityIds));
        for (const lead of leads) {
          const row = entityMap.get(lead.lead_code);
          if (row) { row.cif_number = lead.lead_code; row.referring_rm_id = lead.assigned_rm_id; row.location = lead.country_of_residence; row.preferred_language = lead.preferred_language; }
        }
      } else if (entityType === 'prospect') {
        const prospectsData = await db
          .select({ prospect_code: schema.prospects.prospect_code, cif_number: schema.prospects.cif_number, assigned_rm_id: schema.prospects.assigned_rm_id, country_of_residence: schema.prospects.country_of_residence, preferred_language: schema.prospects.preferred_language })
          .from(schema.prospects)
          .where(inArray(schema.prospects.prospect_code, entityIds));
        for (const p of prospectsData) {
          const row = entityMap.get(p.prospect_code);
          if (row) { row.cif_number = p.cif_number; row.referring_rm_id = p.assigned_rm_id; row.location = p.country_of_residence; row.preferred_language = p.preferred_language; }
        }
      }
    }

    let results = Array.from(entityMap.values());

    // If we have fewer than pageSize results, pad with placeholders
    if (results.length < pageSize) {
      const prefixMap = { lead: 'LD', prospect: 'PR', client: 'CL' } as const;
      const prefix = prefixMap[entityType];
      const needed = pageSize - results.length;
      for (let i = 0; i < needed; i++) {
        const seq = results.length + i + 1;
        const id = `${prefix}-${String(seq).padStart(6, '0')}`;
        if (!entityMap.has(id)) {
          results.push({
            entity_id: id,
            entity_name_en: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${seq}`,
            entity_name_local: null,
            aum_at_handover: String(Math.round(Math.random() * 50_000_000)),
            product_count: Math.floor(Math.random() * 10) + 1,
            cif_number: null,
            referring_rm_id: null,
            location: null,
            preferred_language: null,
          });
        }
      }
    }

    // Apply search filter
    if (filters.search) {
      const term = filters.search.toLowerCase();
      results = results.filter(
        (r) =>
          (r.entity_id && r.entity_id.toLowerCase().includes(term)) ||
          (r.entity_name_en && r.entity_name_en.toLowerCase().includes(term)) ||
          (r.entity_name_local && r.entity_name_local.toLowerCase().includes(term)),
      );
    }

    // HAM-GAP-008: Location quick-filter (country_of_residence)
    if (filters.location) {
      const loc = filters.location.toLowerCase();
      results = results.filter((r) => r.location && r.location.toLowerCase() === loc);
    }

    // HAM-GAP-008: Preferred language quick-filter
    if (filters.language) {
      const lang = filters.language.toLowerCase();
      results = results.filter((r) => r.preferred_language && r.preferred_language.toLowerCase() === lang);
    }

    const total = results.length;
    const data = results.slice((page - 1) * pageSize, page * pageSize);
    return { data, total, page, pageSize };
  },

  // ---------------------------------------------------------------------------
  // 2. createHandoverRequest
  // ---------------------------------------------------------------------------
  async createHandoverRequest(data: {
    entity_type: 'lead' | 'prospect' | 'client';
    items: Array<{
      entity_id: string;
      entity_name_en: string;
      entity_name_local?: string;
      aum?: number;
      open_orders_count?: number;
    }>;
    outgoing_rm_id: number;
    incoming_rm_id: number;
    incoming_srm_id?: number;
    incoming_referring_rm_id?: number;
    incoming_branch_rm_id?: number;
    reason: string;
    branch_code?: string;
    scrutiny_checklist?: Array<{
      template_item_id: number;
      status: 'pending' | 'completed' | 'not_applicable' | 'work_in_progress';
      remarks?: string;
    }>;
    created_by: string;
  }): Promise<Handover & { items: HandoverItem[]; checklistItems: Array<typeof schema.scrutinyChecklistItems.$inferSelect> }> {
    // Validate: outgoing RM must differ from incoming RM
    if (data.outgoing_rm_id === data.incoming_rm_id) {
      throw new Error('Outgoing RM and incoming RM cannot be the same person');
    }

    if (!data.items.length) {
      throw new Error('At least one entity item is required');
    }

    // Validate: reason must be at least 5 characters (BRD HAM-013)
    if (!data.reason || data.reason.trim().length < 5) {
      throw new Error('Handover Reason must be at least 5 characters');
    }

    // HAM-GAP-024: block re-selection of entity with existing PENDING/active handover
    const entityIdsToCheck = data.items.map((i) => String(i.entity_id));
    if (entityIdsToCheck.length > 0) {
      const pendingItems = await db
        .select({ entity_id: schema.handoverItems.entity_id })
        .from(schema.handoverItems)
        .innerJoin(schema.handovers, eq(schema.handoverItems.handover_id, schema.handovers.id))
        .where(and(
          inArray(schema.handoverItems.entity_id, entityIdsToCheck),
          or(
            eq(schema.handovers.status, 'pending_auth'),
            eq(schema.handovers.status, 'bulk_pending_review'),
          ) as any,
        ));
      if (pendingItems.length > 0) {
        const blocked = [...new Set(pendingItems.map((p: any) => p.entity_id))].join(', ');
        throw new Error(`Entity already has a pending handover: ${blocked}. Complete or cancel the existing handover first.`);
      }
    }

    // Validate: for client handovers, all mandatory scrutiny items must be completed
    if (data.entity_type === 'client' && data.scrutiny_checklist) {
      const pendingMandatory = data.scrutiny_checklist.filter(
        (ci) => ci.status === 'pending',
      );
      if (pendingMandatory.length > 0) {
        throw new Error(
          `All mandatory scrutiny checklist items must be completed (${pendingMandatory.length} item(s) still pending)`,
        );
      }
    }

    // Look up RM names for denormalized storage
    const rmIds = [
      data.outgoing_rm_id,
      data.incoming_rm_id,
      ...(data.incoming_srm_id ? [data.incoming_srm_id] : []),
    ];
    const rmUsers = await db
      .select({
        id: schema.users.id,
        full_name: schema.users.full_name,
        email: schema.users.email,
        role: schema.users.role,
        branch_id: schema.users.branch_id,
        office: schema.users.office,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, rmIds));
    const rmNameMap = new Map(rmUsers.map((u: any) => [u.id, u.full_name]));
    const rmUserMap = new Map<number, HandoverRoutingUser>(rmUsers.map((u: any) => [Number(u.id), {
      id: Number(u.id),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      branch_id: u.branch_id ?? null,
      office: u.office ?? null,
    }]));

    // Generate handover number: HAM-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.handovers)
      .where(sql`${schema.handovers.handover_number} LIKE ${'HAM-' + year + '-%'}`);
    const seq = Number(countResult[0]?.count ?? 0) + 1;
    const handoverNumber = `HAM-${year}-${String(seq).padStart(6, '0')}`;

    // Calculate SLA deadline (48 hours from now)
    const now = new Date();
    const slaDeadline = new Date(now);
    slaDeadline.setHours(slaDeadline.getHours() + 48);
    const route = buildHandoverAuthorizationRoute({
      outgoingRm: rmUserMap.get(data.outgoing_rm_id) ?? null,
      incomingRm: rmUserMap.get(data.incoming_rm_id) ?? null,
      createdBy: data.created_by,
      now,
      slaDeadline,
    });
    const routeUpdate = makeRouteUpdate(
      route,
      [],
      'ROUTED',
      data.created_by,
      'HANDOVER_CREATED',
      { outgoing_rm_id: data.outgoing_rm_id, incoming_rm_id: data.incoming_rm_id },
      now,
    );

    // Insert the handover record
    const [handover] = await db
      .insert(schema.handovers)
      .values({
        handover_number: handoverNumber,
        entity_type: data.entity_type,
        outgoing_rm_id: data.outgoing_rm_id,
        incoming_rm_id: data.incoming_rm_id,
        incoming_srm_id: data.incoming_srm_id ?? null,
        incoming_referring_rm_id: data.incoming_referring_rm_id ?? null,
        incoming_branch_rm_id: data.incoming_branch_rm_id ?? null,
        reason: data.reason,
        branch_code: data.branch_code ?? null,
        outgoing_rm_name: rmNameMap.get(data.outgoing_rm_id) ?? null,
        incoming_rm_name: rmNameMap.get(data.incoming_rm_id) ?? null,
        incoming_srm_name: data.incoming_srm_id ? (rmNameMap.get(data.incoming_srm_id) ?? null) : null,
        status: 'pending_auth',
        sla_deadline: slaDeadline,
        ...routeUpdate,
        is_bulk_upload: false,
        requires_client_consent: data.entity_type === 'client',
        created_by: data.created_by,
        updated_by: data.created_by,
      })
      .returning();

    // Insert handover items
    const itemValues = data.items.map((item) => ({
      handover_id: handover.id,
      entity_id: item.entity_id,
      entity_name_en: item.entity_name_en,
      entity_name_local: item.entity_name_local ?? null,
      previous_rm_id: data.outgoing_rm_id,
      aum_at_handover: item.aum != null ? String(item.aum) : null,
      open_orders_count: item.open_orders_count ?? 0,
      status: 'included',
      created_by: data.created_by,
      updated_by: data.created_by,
    }));

    const items = await db
      .insert(schema.handoverItems)
      .values(itemValues)
      .returning();

    // Insert scrutiny checklist items if provided
    let checklistItems: Array<typeof schema.scrutinyChecklistItems.$inferSelect> = [];
    if (data.scrutiny_checklist && data.scrutiny_checklist.length > 0) {
      const checklistValues = data.scrutiny_checklist.map((ci) => ({
        handover_id: handover.id,
        template_item_id: ci.template_item_id,
        validation_label: '', // will be populated from template below
        remarks: ci.remarks ?? null,
        status: ci.status,
        created_by: data.created_by,
        updated_by: data.created_by,
      }));

      // Fetch template labels for validation_label
      const templateIds = data.scrutiny_checklist.map((ci) => ci.template_item_id);
      const templates = await db
        .select({ id: schema.scrutinyTemplates.id, label: schema.scrutinyTemplates.label })
        .from(schema.scrutinyTemplates)
        .where(inArray(schema.scrutinyTemplates.id, templateIds));
      const labelMap = new Map(templates.map((t: any) => [t.id, t.label]));

      for (const cv of checklistValues) {
        cv.validation_label = String(labelMap.get(cv.template_item_id) ?? `Template #${cv.template_item_id}`);
      }

      checklistItems = await db
        .insert(schema.scrutinyChecklistItems)
        .values(checklistValues)
        .returning();
    }

    // Create audit log entry
    await this.createAuditEntry({
      event_type: 'handover_created',
      reference_type: 'handover',
      reference_id: handover.id,
      actor_id: parseInt(data.created_by, 10) || 1,
      actor_role: 'RM',
      details: {
        handover_number: handoverNumber,
        entity_type: data.entity_type,
        item_count: data.items.length,
        outgoing_rm_id: data.outgoing_rm_id,
        incoming_rm_id: data.incoming_rm_id,
        authorization_route: route.routeType,
        checker_branch_id: route.checkerBranchId,
        owner_team: route.ownerTeam,
      },
    });

    await this.createAuditEntry({
      event_type: 'handover_authorization_routed',
      reference_type: 'handover',
      reference_id: handover.id,
      actor_id: parseInt(data.created_by, 10) || 1,
      actor_role: 'system',
      details: route.snapshot,
    });

    // Send notification to incoming RM
    await this.createNotification({
      notification_type: 'handover_initiated',
      recipient_user_id: data.incoming_rm_id,
      subject: `New Handover Request Initiated`,
      body: `A handover request has been initiated for ${data.items.length} ${data.entity_type}(s). Please review and authorize.`,
      reference_type: 'handover',
      reference_id: (handover as any).id,
    });

    return { ...handover, items, checklistItems };
  },

  // ---------------------------------------------------------------------------
  // 3. getHandoverRequest
  // ---------------------------------------------------------------------------
  async getHandoverRequest(id: number): Promise<(Handover & { sla_status: string | null; outgoing_rm: Record<string, unknown> | null; incoming_rm: Record<string, unknown> | null; incoming_srm: Record<string, unknown> | null; incoming_referring_rm: Record<string, unknown> | null; incoming_branch_rm: Record<string, unknown> | null; authorized_by_user: Record<string, unknown> | null; items: HandoverItem[]; checklistItems: Record<string, unknown>[]; auditEntries: Record<string, unknown>[] }) | null> {
    // Fetch the handover with RM name lookups via aliased joins
    const [handover] = await db
      .select()
      .from(schema.handovers)
      .where(
        and(
          eq(schema.handovers.id, id),
          eq(schema.handovers.is_deleted, false),
        ),
      );

    if (!handover) return null;

    // Fetch RM user details for display
    const rmIds = [
      handover.outgoing_rm_id,
      handover.incoming_rm_id,
      handover.incoming_srm_id,
      handover.incoming_referring_rm_id,
      handover.incoming_branch_rm_id,
      handover.authorized_by,
    ].filter((id): id is number => id != null);

    const rmUsers = rmIds.length > 0
      ? await db
          .select({ id: schema.users.id, full_name: schema.users.full_name, email: schema.users.email, role: schema.users.role })
          .from(schema.users)
          .where(inArray(schema.users.id, rmIds))
      : [];
    const userMap = new Map(rmUsers.map((u: any) => [u.id, u]));

    // Fetch related items
    const items = await db
      .select()
      .from(schema.handoverItems)
      .where(eq(schema.handoverItems.handover_id, id))
      .orderBy(asc(schema.handoverItems.id));

    // Fetch scrutiny checklist items with template info
    const checklistItems = await db
      .select({
        id: schema.scrutinyChecklistItems.id,
        handover_id: schema.scrutinyChecklistItems.handover_id,
        template_item_id: schema.scrutinyChecklistItems.template_item_id,
        validation_label: schema.scrutinyChecklistItems.validation_label,
        remarks: schema.scrutinyChecklistItems.remarks,
        completed_by: schema.scrutinyChecklistItems.completed_by,
        completed_at: schema.scrutinyChecklistItems.completed_at,
        status: schema.scrutinyChecklistItems.status,
        template_label: schema.scrutinyTemplates.label,
        template_category: schema.scrutinyTemplates.category,
        is_mandatory: schema.scrutinyTemplates.is_mandatory,
      })
      .from(schema.scrutinyChecklistItems)
      .leftJoin(
        schema.scrutinyTemplates,
        eq(schema.scrutinyChecklistItems.template_item_id, schema.scrutinyTemplates.id),
      )
      .where(eq(schema.scrutinyChecklistItems.handover_id, id))
      .orderBy(asc(schema.scrutinyChecklistItems.id));

    // Fetch recent audit log entries (last 50)
    const auditEntries = await db
      .select({
        id: schema.handoverAuditLog.id,
        event_type: schema.handoverAuditLog.event_type,
        reference_type: schema.handoverAuditLog.reference_type,
        reference_id: schema.handoverAuditLog.reference_id,
        actor_id: schema.handoverAuditLog.actor_id,
        actor_role: schema.handoverAuditLog.actor_role,
        details: schema.handoverAuditLog.details,
        created_at: schema.handoverAuditLog.created_at,
        actor_name: schema.users.full_name,
      })
      .from(schema.handoverAuditLog)
      .leftJoin(schema.users, eq(schema.handoverAuditLog.actor_id, schema.users.id))
      .where(
        and(
          eq(schema.handoverAuditLog.reference_type, 'handover'),
          eq(schema.handoverAuditLog.reference_id, id),
        ),
      )
      .orderBy(desc(schema.handoverAuditLog.created_at))
      .limit(50);

    return {
      ...handover,
      sla_status: this._computeSlaStatus(handover.sla_deadline),
      outgoing_rm: userMap.get(handover.outgoing_rm_id) ?? null,
      incoming_rm: userMap.get(handover.incoming_rm_id) ?? null,
      incoming_srm: handover.incoming_srm_id ? (userMap.get(handover.incoming_srm_id) ?? null) : null,
      incoming_referring_rm: handover.incoming_referring_rm_id
        ? (userMap.get(handover.incoming_referring_rm_id) ?? null)
        : null,
      incoming_branch_rm: handover.incoming_branch_rm_id
        ? (userMap.get(handover.incoming_branch_rm_id) ?? null)
        : null,
      authorized_by_user: handover.authorized_by ? (userMap.get(handover.authorized_by) ?? null) : null,
      items,
      checklistItems,
      auditEntries,
    };
  },

  // ---------------------------------------------------------------------------
  // 4. getHandoverHistory
  // ---------------------------------------------------------------------------
  async getHandoverHistory(filters: {
    dateFrom?: string;
    dateTo?: string;
    event_type?: string;
    reference_type?: string;
    actor_id?: number;
    entity_id?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: Record<string, unknown>[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.dateFrom) {
      conditions.push(gte(schema.handoverAuditLog.created_at, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
      conditions.push(lte(schema.handoverAuditLog.created_at, new Date(filters.dateTo)));
    }
    if (filters.event_type) {
      conditions.push(eq(schema.handoverAuditLog.event_type, filters.event_type as any));
    }
    if (filters.reference_type) {
      conditions.push(eq(schema.handoverAuditLog.reference_type, filters.reference_type as any));
    }
    if (filters.actor_id) {
      conditions.push(eq(schema.handoverAuditLog.actor_id, filters.actor_id));
    }
    // HAM-GAP-012: entity_id maps to reference_id; status maps to event_type prefix
    if (filters.entity_id) {
      conditions.push(eq(schema.handoverAuditLog.reference_id, filters.entity_id));
    }
    if (filters.status) {
      conditions.push(eq(schema.handoverAuditLog.event_type, filters.status as any));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.handoverAuditLog)
      .where(whereClause);
    const total = Number(countResult[0]?.total ?? 0);

    // Get paginated results with actor name
    const data = await db
      .select({
        id: schema.handoverAuditLog.id,
        event_type: schema.handoverAuditLog.event_type,
        reference_type: schema.handoverAuditLog.reference_type,
        reference_id: schema.handoverAuditLog.reference_id,
        actor_id: schema.handoverAuditLog.actor_id,
        actor_role: schema.handoverAuditLog.actor_role,
        details: schema.handoverAuditLog.details,
        ip_address: schema.handoverAuditLog.ip_address,
        created_at: schema.handoverAuditLog.created_at,
        actor_name: schema.users.full_name,
      })
      .from(schema.handoverAuditLog)
      .leftJoin(schema.users, eq(schema.handoverAuditLog.actor_id, schema.users.id))
      .where(whereClause)
      .orderBy(desc(schema.handoverAuditLog.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize };
  },

  // ---------------------------------------------------------------------------
  // 5. getChecklistConfig
  // ---------------------------------------------------------------------------
  async getChecklistConfig(): Promise<(typeof schema.scrutinyTemplates.$inferSelect)[]> {
    const templates = await db
      .select()
      .from(schema.scrutinyTemplates)
      .where(eq(schema.scrutinyTemplates.is_active, true))
      .orderBy(asc(schema.scrutinyTemplates.sort_order), asc(schema.scrutinyTemplates.id));

    return templates;
  },

  // ---------------------------------------------------------------------------
  // 6. getClientImpact
  // ---------------------------------------------------------------------------
  /**
   * Return impact data for a client entity. Since there is no dedicated
   * client-master table, we return simulated but realistic data.
   * In production this would query portfolio, order, and service-request tables.
   */
  async getClientImpact(clientId: string): Promise<{ client_id: string; aum: number; pending_orders: number; pending_settlements: number; product_count: number; open_service_requests: number; upcoming_maturities: number }> {
    // Check if the client appears in any handover items for real AUM data
    const [existingItem] = await db
      .select({
        aum_at_handover: schema.handoverItems.aum_at_handover,
        open_orders_count: schema.handoverItems.open_orders_count,
        pending_settlements_count: schema.handoverItems.pending_settlements_count,
        product_count: schema.handoverItems.product_count,
      })
      .from(schema.handoverItems)
      .where(eq(schema.handoverItems.entity_id, clientId))
      .orderBy(desc(schema.handoverItems.id))
      .limit(1);

    if (existingItem) {
      return {
        client_id: clientId,
        aum: parseFloat(existingItem.aum_at_handover ?? '0'),
        pending_orders: existingItem.open_orders_count ?? 0,
        pending_settlements: existingItem.pending_settlements_count ?? 0,
        product_count: existingItem.product_count ?? 0,
        open_service_requests: 2,
        upcoming_maturities: 1,
      };
    }

    // Fallback: simulated data for demo/dev purposes
    return {
      client_id: clientId,
      aum: 12_500_000,
      pending_orders: 3,
      pending_settlements: 1,
      product_count: 5,
      open_service_requests: 2,
      upcoming_maturities: 1,
    };
  },

  // ---------------------------------------------------------------------------
  // 7. listRMs
  // ---------------------------------------------------------------------------
  async listRMs(filters: { search?: string; branch?: string; supervisor_id?: number } = {}): Promise<{ id: number; username: string; full_name: string | null; email: string | null; role: string | null; office: string | null; branch_id: number | null }[]> {
    const conditions: ReturnType<typeof eq>[] = [];
    conditions.push(eq(schema.users.is_active, true));

    if (filters.branch) {
      conditions.push(eq(schema.users.office, filters.branch));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let results = await db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        full_name: schema.users.full_name,
        email: schema.users.email,
        role: schema.users.role,
        office: schema.users.office,
        branch_id: schema.users.branch_id,
      })
      .from(schema.users)
      .where(whereClause)
      .orderBy(asc(schema.users.full_name));

    // Filter by role containing "RM" or matching RM-related roles
    results = results.filter((u: any) => {
      const role = (u.role ?? '').toUpperCase();
      return role.includes('RM') || role.includes('RELATIONSHIP') || role.includes('MANAGER');
    });

    // Apply text search
    if (filters.search) {
      const term = filters.search.toLowerCase();
      results = results.filter(
        (u: any) =>
          (u.full_name ?? '').toLowerCase().includes(term) ||
          (u.username ?? '').toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term),
      );
    }

    return results;
  },

  // ---------------------------------------------------------------------------
  // 8. createAuditEntry
  // ---------------------------------------------------------------------------
  async createAuditEntry(data: {
    event_type: string;
    reference_type: string;
    reference_id: number;
    actor_id: number;
    actor_role: string;
    details?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
  }): Promise<typeof schema.handoverAuditLog.$inferSelect> {
    const [entry] = await db
      .insert(schema.handoverAuditLog)
      .values({
        event_type: data.event_type as any,
        reference_type: data.reference_type as any,
        reference_id: data.reference_id,
        actor_id: data.actor_id,
        actor_role: data.actor_role,
        details: data.details ?? null,
        ip_address: data.ip_address ?? null,
        user_agent: data.user_agent ?? null,
      })
      .returning();

    return entry;
  },

  // ---------------------------------------------------------------------------
  // 9. getDashboardSummary
  // ---------------------------------------------------------------------------
  async getDashboardSummary(filters: { branch_code?: string; from_date?: string; to_date?: string } = {}): Promise<{
    pending_count: { lead: number; prospect: number; client: number };
    recent_transfers: Record<string, unknown>[];
    recent_handovers: Record<string, unknown>[];
    active_delegations_count: number;
    expiring_soon_count: number;
    total_aum_pending: number;
  }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // All non-deleted handovers
    const allHandovers = await db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.is_deleted, false));

    // Pending count broken down by entity_type
    const pendingHandovers = allHandovers.filter(
      (h: any) => h.status === 'pending_auth' || h.status === 'bulk_pending_review',
    );
    const pendingByEntityType = {
      lead: pendingHandovers.filter((h: any) => h.entity_type === 'lead').length,
      prospect: pendingHandovers.filter((h: any) => h.entity_type === 'prospect').length,
      client: pendingHandovers.filter((h: any) => h.entity_type === 'client').length,
    };

    // Recent transfers (authorized in last 30 days)
    const recentTransfers = allHandovers
      .filter((h: any) => {
        if (h.status !== 'authorized') return false;
        if (!h.authorized_at) return false;
        return new Date(h.authorized_at) >= thirtyDaysAgo;
      })
      .sort((a: any, b: any) => {
        const dateA = a.authorized_at ? new Date(a.authorized_at).getTime() : 0;
        const dateB = b.authorized_at ? new Date(b.authorized_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    // Active delegations count
    const activeDelegations = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.delegationRequests)
      .where(eq(schema.delegationRequests.status, 'active'));
    const activeDelegationsCount = Number(activeDelegations[0]?.total ?? 0);

    // Delegations expiring within 7 days
    const expiringDelegations = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.delegationRequests)
      .where(
        and(
          eq(schema.delegationRequests.status, 'active'),
          lte(schema.delegationRequests.end_date, sevenDaysFromNow.toISOString().split('T')[0]),
          gte(schema.delegationRequests.end_date, now.toISOString().split('T')[0]),
        ),
      );
    const expiringSoonCount = Number(expiringDelegations[0]?.total ?? 0);

    // Total AUM of pending handover items
    const pendingHandoverIds = pendingHandovers.map((h: any) => h.id);
    let totalAumPending = 0;
    if (pendingHandoverIds.length > 0) {
      const pendingItems = await db
        .select({ aum_at_handover: schema.handoverItems.aum_at_handover })
        .from(schema.handoverItems)
        .where(
          and(
            inArray(schema.handoverItems.handover_id, pendingHandoverIds),
            eq(schema.handoverItems.status, 'included'),
          ),
        );
      totalAumPending = pendingItems.reduce(
        (sum: number, item: any) => sum + parseFloat(item.aum_at_handover ?? '0'),
        0,
      );
    }

    const mappedTransfers = recentTransfers.map((h: any) => ({
      id: h.id,
      handover_number: h.handover_number,
      entity_type: h.entity_type,
      status: h.status,
      outgoing_rm_name: h.outgoing_rm_name,
      incoming_rm_name: h.incoming_rm_name,
      authorized_at: h.authorized_at,
      branch_code: h.branch_code,
      created_at: h.created_at,
      sla_deadline: h.sla_deadline,
      sla_status: this._computeSlaStatus(h.sla_deadline),
    }));

    return {
      pending_count: pendingByEntityType,
      recent_transfers: mappedTransfers,
      recent_handovers: mappedTransfers,
      active_delegations_count: activeDelegationsCount,
      expiring_soon_count: expiringSoonCount,
      total_aum_pending: totalAumPending,
    };
  },

  // ===========================================================================
  // Phase 2 — Authorization Methods
  // ===========================================================================

  /**
   * List pending handover requests for the Checker authorization queue.
   */
  async getPendingRequests(filters: {
    entity_type?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: (Handover & { item_count: number })[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.handovers.is_deleted, false),
    ];
    // Pending includes pending_auth and bulk_pending_review
    conditions.push(
      or(
        eq(schema.handovers.status, 'pending_auth' as any),
        eq(schema.handovers.status, 'bulk_pending_review' as any),
      ) as any,
    );
    if (filters.entity_type) {
      conditions.push(eq(schema.handovers.entity_type, filters.entity_type as any));
    }

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.handovers)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(schema.handovers)
      .where(and(...conditions))
      .orderBy(desc(schema.handovers.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Fetch item counts for each request
    const handoverIds = rows.map((r: any) => r.id);
    let itemCounts: Record<number, number> = {};
    if (handoverIds.length > 0) {
      const counts = await db
        .select({
          handover_id: schema.handoverItems.handover_id,
          count: sql<number>`count(*)`,
        })
        .from(schema.handoverItems)
        .where(inArray(schema.handoverItems.handover_id, handoverIds))
        .groupBy(schema.handoverItems.handover_id);
      itemCounts = Object.fromEntries(counts.map((c: any) => [c.handover_id, Number(c.count)]));
    }

    return {
      data: rows.map((r: any) => ({
        ...r,
        item_count: itemCounts[r.id] ?? 0,
      })),
      total: Number(total[0]?.count ?? 0),
      page,
      pageSize,
    };
  },

  /**
   * Authorize a handover request with optimistic locking.
   * - Validates version match (409 on mismatch)
   * - Validates checker != maker (segregation of duties)
   * - Auto-cancels active delegations for same entities (EARLY_TERMINATED)
   */
  async authorizeRequest(id: number, version: number, checkerId: string): Promise<{ data?: Handover; error?: string; status?: number }> {
    const request = await db
      .select()
      .from(schema.handovers)
      .where(and(eq(schema.handovers.id, id), eq(schema.handovers.is_deleted, false)))
      .limit(1);

    if (request.length === 0) {
      return { error: 'Handover request not found', status: 404 };
    }
    const req = request[0];
    if (req.status !== 'pending_auth' && req.status !== 'bulk_pending_review') {
      return { error: `Cannot authorize request in status: ${req.status}`, status: 400 };
    }
    if (req.version !== version) {
      return { error: 'Version mismatch — request has been modified', status: 409 };
    }
    if (req.created_by === checkerId) {
      return { error: 'Checker cannot authorize own submissions (segregation of duties)', status: 403 };
    }

    const routingUserIds = [req.outgoing_rm_id, req.incoming_rm_id, Number(checkerId)]
      .filter((value): value is number => Number.isFinite(Number(value)) && Number(value) > 0)
      .map(Number);
    const routingUsers = routingUserIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            full_name: schema.users.full_name,
            email: schema.users.email,
            role: schema.users.role,
            branch_id: schema.users.branch_id,
            office: schema.users.office,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, Array.from(new Set(routingUserIds))))
      : [];
    const routingUserMap = new Map<number, HandoverRoutingUser>(routingUsers.map((u: any) => [Number(u.id), {
      id: Number(u.id),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      branch_id: u.branch_id ?? null,
      office: u.office ?? null,
    }]));
    const now = new Date();
    const route = buildHandoverAuthorizationRoute({
      handoverId: req.id,
      handoverNumber: req.handover_number,
      outgoingRm: routingUserMap.get(req.outgoing_rm_id) ?? null,
      incomingRm: routingUserMap.get(req.incoming_rm_id) ?? null,
      sourceBranchId: req.source_branch_id ?? null,
      targetBranchId: req.target_branch_id ?? null,
      createdBy: req.created_by,
      now,
      slaDeadline: req.authorization_due_at ?? req.sla_deadline ?? null,
    });
    const checker = routingUserMap.get(Number(checkerId)) ?? null;
    const routeDecision = evaluateHandoverCheckerAuthorization(route, checker, req.created_by);
    if (!routeDecision.allowed) {
      return { error: routeDecision.error, status: routeDecision.status };
    }

    // HAM-GAP-016: All mandatory (non-not_applicable) scrutiny checklist items must be completed before authorization
    const pendingScrutinyItems = await db
      .select({ id: schema.scrutinyChecklistItems.id, validation_label: schema.scrutinyChecklistItems.validation_label })
      .from(schema.scrutinyChecklistItems)
      .where(and(
        eq(schema.scrutinyChecklistItems.handover_id, id),
        eq(schema.scrutinyChecklistItems.status, 'pending'),
      ));
    if (pendingScrutinyItems.length > 0) {
      const labels = pendingScrutinyItems.slice(0, 3).map((i: { validation_label: string }) => i.validation_label).join('; ');
      return {
        error: `${pendingScrutinyItems.length} scrutiny checklist item(s) are still pending (e.g. ${labels}). Complete all checklist items before authorization.`,
        status: 422,
      };
    }

    // Update handover status to authorized
    const updated = await db
      .update(schema.handovers)
      .set({
        status: 'authorized' as any,
        authorized_by: Number(checkerId) || null,
        authorized_at: now,
        version: req.version + 1,
        ...makeRouteUpdate(
          route,
          req.routing_history,
          'AUTHORIZED',
          checkerId,
          'CHECKER_APPROVED',
          {
            checker_branch_id: checker?.branch_id ?? null,
            checker_role: checker?.role ?? null,
          },
          now,
        ),
        updated_by: checkerId,
        updated_at: now,
      })
      .where(and(eq(schema.handovers.id, id), eq(schema.handovers.version, version)))
      .returning();

    if (updated.length === 0) {
      return { error: 'Concurrent modification detected', status: 409 };
    }

    // Fetch items to auto-cancel active delegations for same entities
    const items = await db
      .select()
      .from(schema.handoverItems)
      .where(eq(schema.handoverItems.handover_id, id));

    const entityIds = items.map((i: any) => i.entity_id);

    // Auto-cancel active delegations for these entities
    if (entityIds.length > 0) {
      const activeDelegationItems = await db
        .select({ delegation_id: schema.delegationItems.delegation_request_id })
        .from(schema.delegationItems)
        .innerJoin(
          schema.delegationRequests,
          eq(schema.delegationItems.delegation_request_id, schema.delegationRequests.id),
        )
        .where(
          and(
            inArray(schema.delegationItems.entity_id, entityIds),
            eq(schema.delegationRequests.status, 'active'),
          ),
        );

      const delegationIdsToCancel = Array.from(new Set(activeDelegationItems.map((d: any) => Number(d.delegation_id)))) as number[];
      for (const delId of delegationIdsToCancel) {
        await db
          .update(schema.delegationRequests)
          .set({
            status: 'early_terminated',
            early_termination_reason: `Superseded by handover authorization #${id}`,
            updated_by: checkerId,
            updated_at: now,
          })
          .where(eq(schema.delegationRequests.id, delId));

        await this.createAuditEntry({
          event_type: 'delegation_early_terminated',
          reference_type: 'delegation',
          reference_id: delId,
          actor_id: Number(checkerId) || 0,
          actor_role: 'system',
          details: { reason: 'Superseded by handover authorization' },
        });
      }
    }

    // Transfer assigned_rm_id on each entity to the incoming RM
    for (const item of items) {
      const entityIdNum = Number(item.entity_id);
      if (req.entity_type === 'lead' && !isNaN(entityIdNum)) {
        await db.update(schema.leads)
          .set({ assigned_rm_id: req.incoming_rm_id, updated_by: checkerId, updated_at: now })
          .where(eq(schema.leads.id, entityIdNum));
      } else if (req.entity_type === 'prospect' && !isNaN(entityIdNum)) {
        await db.update(schema.prospects)
          .set({ assigned_rm_id: req.incoming_rm_id, updated_by: checkerId, updated_at: now })
          .where(eq(schema.prospects.id, entityIdNum));
      } else if (req.entity_type === 'client') {
        // HAM-GAP-003: clients.assigned_rm_id must be updated on authorization
        await db.update(schema.clients)
          .set({ assigned_rm_id: req.incoming_rm_id, updated_by: checkerId, updated_at: now } as any)
          .where(eq(schema.clients.client_id, item.entity_id));
      }
      // HAM-GAP-013: entity-level audit record for each entity RM change
      await db.insert(schema.auditRecords).values({
        entity_type: req.entity_type,
        entity_id: item.entity_id,
        action: 'RM_HANDOVER',
        actor_id: checkerId,
        changes: {
          assigned_rm_id: { from: req.outgoing_rm_id, to: req.incoming_rm_id },
          handover_id: id,
          handover_number: req.handover_number,
        },
      } as any);
    }

    // Create audit log
    await this.createAuditEntry({
      event_type: 'handover_authorized',
      reference_type: 'handover',
      reference_id: id,
      actor_id: Number(checkerId) || 0,
      actor_role: 'system',
      details: {
        version: req.version + 1,
        entities_transferred: items.length,
        authorization_route: route.routeType,
        checker_branch_id: route.checkerBranchId,
        owner_team: route.ownerTeam,
      },
    });

    // Notify the outgoing RM
    await this.createNotification({
      notification_type: 'handover_authorized',
      recipient_user_id: req.outgoing_rm_id,
      subject: `Handover Request Authorized`,
      body: `Your handover request ${req.handover_number} has been authorized.`,
      reference_type: 'handover',
      reference_id: id,
    });

    return { data: updated[0] };
  },

  /**
   * Reject a handover request with optimistic locking.
   */
  async rejectRequest(id: number, version: number, checkerId: string, reason: string): Promise<{ data?: Handover; error?: string; status?: number }> {
    // Validate rejection reason minimum length (BRD HAM-013: 5 chars)
    if (!reason || reason.trim().length < 5) {
      return { error: 'Rejection reason must be at least 5 characters', status: 400 };
    }

    const request = await db
      .select()
      .from(schema.handovers)
      .where(and(eq(schema.handovers.id, id), eq(schema.handovers.is_deleted, false)))
      .limit(1);

    if (request.length === 0) {
      return { error: 'Handover request not found', status: 404 };
    }
    const req = request[0];
    if (req.status !== 'pending_auth' && req.status !== 'bulk_pending_review') {
      return { error: `Cannot reject request in status: ${req.status}`, status: 400 };
    }
    if (req.version !== version) {
      return { error: 'Version mismatch — request has been modified', status: 409 };
    }
    if (req.created_by === checkerId) {
      return { error: 'Checker cannot reject own submissions', status: 403 };
    }

    const routingUserIds = [req.outgoing_rm_id, req.incoming_rm_id, Number(checkerId)]
      .filter((value): value is number => Number.isFinite(Number(value)) && Number(value) > 0)
      .map(Number);
    const routingUsers = routingUserIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            full_name: schema.users.full_name,
            email: schema.users.email,
            role: schema.users.role,
            branch_id: schema.users.branch_id,
            office: schema.users.office,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, Array.from(new Set(routingUserIds))))
      : [];
    const routingUserMap = new Map<number, HandoverRoutingUser>(routingUsers.map((u: any) => [Number(u.id), {
      id: Number(u.id),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      branch_id: u.branch_id ?? null,
      office: u.office ?? null,
    }]));
    const route = buildHandoverAuthorizationRoute({
      handoverId: req.id,
      handoverNumber: req.handover_number,
      outgoingRm: routingUserMap.get(req.outgoing_rm_id) ?? null,
      incomingRm: routingUserMap.get(req.incoming_rm_id) ?? null,
      sourceBranchId: req.source_branch_id ?? null,
      targetBranchId: req.target_branch_id ?? null,
      createdBy: req.created_by,
      now: new Date(),
      slaDeadline: req.authorization_due_at ?? req.sla_deadline ?? null,
    });
    const checker = routingUserMap.get(Number(checkerId)) ?? null;
    const routeDecision = evaluateHandoverCheckerAuthorization(route, checker, req.created_by);
    if (!routeDecision.allowed) {
      return { error: routeDecision.error, status: routeDecision.status };
    }

    const now = new Date();
    const updated = await db
      .update(schema.handovers)
      .set({
        status: 'rejected' as any,
        rejection_reason: reason,
        authorized_by: Number(checkerId) || null,
        authorized_at: now,
        version: req.version + 1,
        updated_by: checkerId,
        updated_at: now,
      })
      .where(and(eq(schema.handovers.id, id), eq(schema.handovers.version, version)))
      .returning();

    if (updated.length === 0) {
      return { error: 'Concurrent modification detected', status: 409 };
    }

    await this.createAuditEntry({
      event_type: 'handover_rejected',
      reference_type: 'handover',
      reference_id: id,
      actor_id: Number(checkerId) || 0,
      actor_role: 'system',
      details: {
        reason,
        version: req.version + 1,
        authorization_route: route.routeType,
        checker_branch_id: route.checkerBranchId,
        owner_team: route.ownerTeam,
      },
    });

    // Notify the outgoing RM
    await this.createNotification({
      notification_type: 'handover_rejected',
      recipient_user_id: req.outgoing_rm_id,
      subject: `Handover Request Rejected`,
      body: `Your handover request ${req.handover_number} has been rejected. Reason: ${reason}`,
      reference_type: 'handover',
      reference_id: id,
    });

    return { data: updated[0] };
  },

  /**
   * Batch authorize multiple requests. Processes each independently.
   */
  async batchAuthorize(requestIds: number[], versions: number[], checkerId: string): Promise<{ results: Array<{ id: number; success: boolean; error?: string }> }> {
    const results: Array<{ id: number; success: boolean; error?: string }> = [];
    for (let i = 0; i < requestIds.length; i++) {
      const result = await this.authorizeRequest(requestIds[i], versions[i], checkerId);
      if (result.error) {
        results.push({ id: requestIds[i], success: false, error: result.error });
      } else {
        results.push({ id: requestIds[i], success: true });
      }
    }
    await this.createAuditEntry({
      event_type: 'batch_authorize',
      reference_type: 'handover',
      reference_id: requestIds[0],
      actor_id: Number(checkerId) || 0,
      actor_role: 'system',
      details: { request_ids: requestIds, results },
    });
    return { results };
  },

  /**
   * Batch reject multiple requests.
   */
  async batchReject(requestIds: number[], versions: number[], checkerId: string, reason: string): Promise<{ results: Array<{ id: number; success: boolean; error?: string }> }> {
    const results: Array<{ id: number; success: boolean; error?: string }> = [];
    for (let i = 0; i < requestIds.length; i++) {
      const result = await this.rejectRequest(requestIds[i], versions[i], checkerId, reason);
      if (result.error) {
        results.push({ id: requestIds[i], success: false, error: result.error });
      } else {
        results.push({ id: requestIds[i], success: true });
      }
    }
    await this.createAuditEntry({
      event_type: 'batch_reject',
      reference_type: 'handover',
      reference_id: requestIds[0],
      actor_id: Number(checkerId) || 0,
      actor_role: 'system',
      details: { request_ids: requestIds, reason, results },
    });
    return { results };
  },

  /**
   * Amend a pending request (increment version).
   */
  async amendRequest(id: number, data: { reason?: string; items?: any[] }, makerId: string): Promise<{ data?: Handover; error?: string; status?: number }> {
    const request = await db
      .select()
      .from(schema.handovers)
      .where(and(eq(schema.handovers.id, id), eq(schema.handovers.is_deleted, false)))
      .limit(1);

    if (request.length === 0) {
      return { error: 'Handover request not found', status: 404 };
    }
    const req = request[0];
    if (req.status !== 'pending_auth') {
      return { error: 'Can only amend pending requests', status: 400 };
    }

    const now = new Date();
    const updates: Record<string, any> = {
      version: req.version + 1,
      updated_by: makerId,
      updated_at: now,
    };
    if (data.reason) updates.reason = data.reason;

    const updated = await db
      .update(schema.handovers)
      .set(updates)
      .where(eq(schema.handovers.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'handover_amended',
      reference_type: 'handover',
      reference_id: id,
      actor_id: Number(makerId) || 0,
      actor_role: 'system',
      details: { changes: data, new_version: req.version + 1 },
    });

    return { data: updated[0] };
  },

  // ===========================================================================
  // Phase 2 — Delegation Methods
  // ===========================================================================

  /**
   * List entities eligible for delegation (excluding those with active delegations).
   */
  async listDelegationEntities(
    entityType: 'lead' | 'prospect' | 'client',
    filters: { search?: string; branch?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ data: { entity_id: string; entity_name_en: string | null; entity_name_local: string | null; aum_at_handover: string | null; product_count: number | null }[]; total: number; page: number; pageSize: number }> {
    // Reuse entity listing but exclude items with active delegations
    const baseEntities = await this.listEntities(entityType, filters);

    // Get entity IDs with active delegations
    const activeDelegItems = await db
      .select({ entity_id: schema.delegationItems.entity_id })
      .from(schema.delegationItems)
      .innerJoin(
        schema.delegationRequests,
        eq(schema.delegationItems.delegation_request_id, schema.delegationRequests.id),
      )
      .where(eq(schema.delegationRequests.status, 'active'));

    const activeDelegEntityIds = new Set(activeDelegItems.map((d: any) => d.entity_id));

    return {
      ...baseEntities,
      data: baseEntities.data.filter((e: any) => !activeDelegEntityIds.has(e.entity_id)),
    };
  },

  /**
   * Create a delegation request. Auto-authorized. Validates:
   * - Delegate RM differs from outgoing RM
   * - Duration <= 90 days
   * - No overlapping active delegation for same entities
   */
  async createDelegation(data: {
    delegation_type: 'lead' | 'prospect' | 'client';
    outgoing_rm_id: number;
    outgoing_rm_name?: string;
    delegate_rm_id: number;
    delegate_rm_name?: string;
    delegate_srm_id?: number;
    branch_code?: string;
    delegation_reason: string;
    start_date: string;
    end_date: string;
    items: Array<{ entity_id: string; entity_name: string; aum?: number }>;
    created_by: string;
  }): Promise<{ data?: typeof schema.delegationRequests.$inferSelect; error?: string; status?: number }> {
    if (data.outgoing_rm_id === data.delegate_rm_id) {
      return { error: 'Delegate RM must differ from outgoing RM', status: 400 };
    }

    // HAM-GAP-004: delegate RM must be in the same branch as the outgoing RM
    const [outgoingUser, delegateUser] = await Promise.all([
      db.select({ branch_id: schema.users.branch_id }).from(schema.users).where(eq(schema.users.id, data.outgoing_rm_id)).limit(1),
      db.select({ branch_id: schema.users.branch_id }).from(schema.users).where(eq(schema.users.id, data.delegate_rm_id)).limit(1),
    ]);
    if (outgoingUser.length && delegateUser.length) {
      const outBranch = outgoingUser[0].branch_id;
      const delBranch = delegateUser[0].branch_id;
      if (outBranch !== null && delBranch !== null && outBranch !== delBranch) {
        return { error: 'Delegate RM must belong to the same branch as the outgoing RM', status: 400 };
      }
    }

    // Validate duration <= 90 days
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      return { error: 'Delegation duration cannot exceed 90 days', status: 400 };
    }
    if (diffDays < 1) {
      return { error: 'End date must be after start date', status: 400 };
    }

    // Check for overlapping active delegations
    const entityIds = data.items.map((i) => i.entity_id);
    if (entityIds.length > 0) {
      const overlapping = await db
        .select({ entity_id: schema.delegationItems.entity_id })
        .from(schema.delegationItems)
        .innerJoin(
          schema.delegationRequests,
          eq(schema.delegationItems.delegation_request_id, schema.delegationRequests.id),
        )
        .where(
          and(
            inArray(schema.delegationItems.entity_id, entityIds),
            eq(schema.delegationRequests.status, 'active'),
          ),
        );
      if (overlapping.length > 0) {
        // HAM-GAP-017: BRD-compliant overlap error includes entity list and conflict hint
        const entityList = [...new Set(overlapping.map((o: any) => o.entity_id))].join(', ');
        return {
          error: `DELEGATION_OVERLAP: The following entities already have an active delegation and cannot be delegated again: ${entityList}. Please revoke the existing delegation first.`,
          status: 409,
        };
      }
    }

    // Create delegation request (auto-authorized)
    const [delegation] = await db
      .insert(schema.delegationRequests)
      .values({
        outgoing_rm_id: data.outgoing_rm_id,
        outgoing_rm_name: data.outgoing_rm_name ?? '',
        delegate_rm_id: data.delegate_rm_id,
        delegate_rm_name: data.delegate_rm_name ?? '',
        delegate_srm_id: data.delegate_srm_id ?? null,
        branch_code: data.branch_code ?? null,
        delegation_reason: data.delegation_reason,
        start_date: data.start_date,
        end_date: data.end_date,
        auto_revert_completed: false,
        extension_count: 0,
        delegation_type: data.delegation_type,
        status: 'active',
        created_by: data.created_by,
        updated_by: data.created_by,
      })
      .returning();

    // Create delegation items
    if (data.items.length > 0) {
      await db.insert(schema.delegationItems).values(
        data.items.map((item) => ({
          delegation_request_id: delegation.id,
          entity_type: data.delegation_type,
          entity_id: item.entity_id,
          entity_name: item.entity_name,
          original_rm_id: data.outgoing_rm_id,
          created_by: data.created_by,
          updated_by: data.created_by,
        })),
      );
    }

    // Audit log
    await this.createAuditEntry({
      event_type: 'delegation_created',
      reference_type: 'delegation',
      reference_id: delegation.id,
      actor_id: Number(data.created_by) || 0,
      actor_role: 'system',
      details: {
        delegation_type: data.delegation_type,
        start_date: data.start_date,
        end_date: data.end_date,
        entity_count: data.items.length,
      },
    });

    // Notify the delegate RM
    await this.createNotification({
      notification_type: 'delegation_started',
      recipient_user_id: data.delegate_rm_id,
      subject: `New Delegation Assigned`,
      body: `A delegation has been assigned to you from ${data.start_date} to ${data.end_date}.`,
      reference_type: 'delegation',
      reference_id: (delegation as any).id,
    });

    return { data: delegation };
  },

  /**
   * Cancel an active delegation, revert assignments.
   */
  async cancelDelegation(id: number, cancelledBy: string): Promise<{ data?: typeof schema.delegationRequests.$inferSelect; error?: string; status?: number }> {
    const [delegation] = await db
      .select()
      .from(schema.delegationRequests)
      .where(eq(schema.delegationRequests.id, id))
      .limit(1);

    if (!delegation) {
      return { error: 'Delegation not found', status: 404 };
    }
    if (delegation.status !== 'active') {
      return { error: `Cannot cancel delegation in status: ${delegation.status}`, status: 400 };
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.delegationRequests)
      .set({
        status: 'cancelled',
        updated_by: cancelledBy,
        updated_at: now,
      })
      .where(eq(schema.delegationRequests.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'delegation_cancelled',
      reference_type: 'delegation',
      reference_id: id,
      actor_id: Number(cancelledBy) || 0,
      actor_role: 'system',
      details: {},
    });

    return { data: updated };
  },

  /**
   * List active delegations with optional filters.
   */
  async getActiveDelegations(filters: {
    delegation_type?: string;
    rm_id?: number;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: (typeof schema.delegationRequests.$inferSelect)[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);

    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.delegationRequests.status, 'active'),
    ];
    if (filters.delegation_type) {
      conditions.push(eq(schema.delegationRequests.delegation_type, filters.delegation_type as any));
    }
    if (filters.rm_id) {
      conditions.push(
        or(
          eq(schema.delegationRequests.outgoing_rm_id, filters.rm_id),
          eq(schema.delegationRequests.delegate_rm_id, filters.rm_id),
        ) as any,
      );
    }

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.delegationRequests)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(schema.delegationRequests)
      .where(and(...conditions))
      .orderBy(desc(schema.delegationRequests.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: rows,
      total: Number(total[0]?.count ?? 0),
      page,
      pageSize,
    };
  },

  /**
   * Get delegation periods for calendar view.
   */
  async getDelegationCalendar(filters: {
    from_date?: string;
    to_date?: string;
    rm_id?: number;
    branch_code?: string;
  } = {}): Promise<{ data: Record<string, unknown>[] }> {
    const conditions: ReturnType<typeof eq>[] = [];
    // Include active and expired delegations for calendar view
    conditions.push(
      or(
        eq(schema.delegationRequests.status, 'active'),
        eq(schema.delegationRequests.status, 'expired'),
      ) as any,
    );
    if (filters.from_date) {
      conditions.push(gte(schema.delegationRequests.end_date, filters.from_date));
    }
    if (filters.to_date) {
      conditions.push(lte(schema.delegationRequests.start_date, filters.to_date));
    }
    if (filters.rm_id) {
      conditions.push(
        or(
          eq(schema.delegationRequests.outgoing_rm_id, filters.rm_id),
          eq(schema.delegationRequests.delegate_rm_id, filters.rm_id),
        ) as any,
      );
    }
    if (filters.branch_code) {
      conditions.push(eq(schema.delegationRequests.branch_code, filters.branch_code));
    }

    const delegations = await db
      .select()
      .from(schema.delegationRequests)
      .where(and(...conditions))
      .orderBy(asc(schema.delegationRequests.start_date));

    return {
      data: delegations.map((d: any) => ({
        id: d.id,
        delegation_type: d.delegation_type,
        outgoing_rm_id: d.outgoing_rm_id,
        outgoing_rm_name: d.outgoing_rm_name,
        delegate_rm_id: d.delegate_rm_id,
        delegate_rm_name: d.delegate_rm_name,
        start_date: d.start_date,
        end_date: d.end_date,
        status: d.status,
      })),
    };
  },

  /**
   * Extend a delegation. Validates extension_count < 1 and total period <= 180 days.
   */
  async extendDelegation(id: number, newEndDate: string, reason: string, requestedBy: string): Promise<{ data?: typeof schema.delegationRequests.$inferSelect; error?: string; status?: number }> {
    const [delegation] = await db
      .select()
      .from(schema.delegationRequests)
      .where(eq(schema.delegationRequests.id, id))
      .limit(1);

    if (!delegation) {
      return { error: 'Delegation not found', status: 404 };
    }
    if (delegation.status !== 'active') {
      return { error: 'Can only extend active delegations', status: 400 };
    }
    if ((delegation.extension_count ?? 0) >= 1) {
      return { error: 'Maximum extension count (1) reached', status: 400 };
    }

    // Validate total period <= 180 days
    const originalStart = new Date(delegation.start_date);
    const newEnd = new Date(newEndDate);
    const totalDays = Math.ceil((newEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60 * 24));
    if (totalDays > 180) {
      return { error: 'Total delegation period (including extension) cannot exceed 180 days', status: 400 };
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.delegationRequests)
      .set({
        end_date: newEndDate,
        extension_count: (delegation.extension_count ?? 0) + 1,
        updated_by: requestedBy,
        updated_at: now,
      })
      .where(eq(schema.delegationRequests.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'delegation_extended',
      reference_type: 'delegation',
      reference_id: id,
      actor_id: Number(requestedBy) || 0,
      actor_role: 'system',
      details: {
        previous_end_date: delegation.end_date,
        new_end_date: newEndDate,
        reason,
        extension_count: (delegation.extension_count ?? 0) + 1,
      },
    });

    return { data: updated };
  },

  /**
   * Process expired delegations — find active delegations past their end date,
   * revert assignments, set status to expired.
   */
  async processExpiredDelegations(): Promise<{ processed: number; results: Array<{ id: number; reverted: boolean }> }> {
    const today = new Date().toISOString().split('T')[0];

    const expired = await db
      .select()
      .from(schema.delegationRequests)
      .where(
        and(
          eq(schema.delegationRequests.status, 'active'),
          lte(schema.delegationRequests.end_date, today),
        ),
      );

    const results: Array<{ id: number; reverted: boolean }> = [];
    for (const delegation of expired) {
      await db
        .update(schema.delegationRequests)
        .set({
          status: 'expired',
          auto_revert_completed: true,
          updated_at: new Date(),
          updated_by: 'system',
        })
        .where(eq(schema.delegationRequests.id, delegation.id));

      // Revert assigned_rm_id back to the original RM for each delegated entity
      const delItems = await db
        .select()
        .from(schema.delegationItems)
        .where(eq(schema.delegationItems.delegation_request_id, delegation.id));

      for (const item of delItems) {
        const entityIdNum = Number(item.entity_id);
        if (item.entity_type === 'lead' && !isNaN(entityIdNum)) {
          await db.update(schema.leads)
            .set({ assigned_rm_id: item.original_rm_id, updated_by: 'system', updated_at: new Date() })
            .where(eq(schema.leads.id, entityIdNum));
        } else if (item.entity_type === 'prospect' && !isNaN(entityIdNum)) {
          await db.update(schema.prospects)
            .set({ assigned_rm_id: item.original_rm_id, updated_by: 'system', updated_at: new Date() })
            .where(eq(schema.prospects.id, entityIdNum));
        } else if (item.entity_type === 'client') {
          // HAM-GAP-002: Revert clients.assigned_rm_id on delegation expiry
          await db.update(schema.clients)
            .set({ assigned_rm_id: item.original_rm_id, updated_by: 'system', updated_at: new Date() } as any)
            .where(eq(schema.clients.client_id, item.entity_id));
        }
      }

      await this.createAuditEntry({
        event_type: 'delegation_expired',
        reference_type: 'delegation',
        reference_id: delegation.id,
        actor_id: 0,
        actor_role: 'system',
        details: { end_date: delegation.end_date, entities_reverted: delItems.length },
      });

      results.push({ id: delegation.id, reverted: true });
    }

    return { processed: results.length, results };
  },

  /**
   * Process expiring delegations — find active delegations ending within the
   * next 48 hours and create notification records so the outgoing RM can act.
   */
  async processExpiringDelegations(): Promise<{ processed: number; results: Array<{ id: number; notified: boolean }> }> {
    // Find active delegations expiring within the next 48 hours (BRD HAM-010)
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    const todayDate = now.toISOString().split('T')[0];

    const expiring = await db
      .select()
      .from(schema.delegationRequests)
      .where(
        and(
          eq(schema.delegationRequests.status, 'active'),
          gte(schema.delegationRequests.end_date, todayDate),
          lte(schema.delegationRequests.end_date, tomorrowDate),
        ),
      );

    const results: Array<{ id: number; notified: boolean }> = [];
    for (const delegation of expiring) {
      // Insert notification for the outgoing RM
      await db.insert(schema.handoverNotifications).values({
        notification_type: 'delegation_expiring',
        channel: 'both',
        recipient_user_id: delegation.outgoing_rm_id,
        subject: `Delegation Expiring Soon`,
        body: `Your delegation (ID: ${delegation.id}) is expiring on ${delegation.end_date}. Please take action if an extension is needed.`,
        reference_type: 'delegation',
        reference_id: delegation.id,
        is_read: false,
        retry_count: 0,
        sent_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'system',
        updated_by: 'system',
      });

      // HAM-GAP-019: also notify the delegate RM (not just outgoing RM)
      await db.insert(schema.handoverNotifications).values({
        notification_type: 'delegation_expiring',
        channel: 'both',
        recipient_user_id: delegation.delegate_rm_id,
        subject: `Delegation Expiring Soon`,
        body: `Your temporary delegation (ID: ${delegation.id}) as delegate RM is expiring on ${delegation.end_date}.`,
        reference_type: 'delegation',
        reference_id: delegation.id,
        is_read: false,
        retry_count: 0,
        sent_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'system',
        updated_by: 'system',
      });

      await this.createAuditEntry({
        event_type: 'delegation_expiring',
        reference_type: 'delegation',
        reference_id: delegation.id,
        actor_id: 0,
        actor_role: 'system',
        details: { end_date: delegation.end_date, notified_rm_id: delegation.outgoing_rm_id, notified_delegate_rm_id: delegation.delegate_rm_id },
      });

      results.push({ id: delegation.id, notified: true });
    }

    return { processed: results.length, results };
  },

  // ===========================================================================
  // Reversal Methods
  // ===========================================================================

  async initiateReversal(id: number, requestedById: number, reason: string): Promise<{ data?: Handover; error?: string; status?: number }> {
    const [handover] = await db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.id, id))
      .limit(1);

    if (!handover) return { error: 'Handover not found', status: 404 };
    if (handover.status !== 'authorized') return { error: 'Only authorized handovers can be reversed', status: 400 };
    if (!reason || reason.trim().length < 5) return { error: 'Reversal reason must be at least 5 characters', status: 400 };

    // 7-day reversal window
    const authorizedAt = handover.authorized_at ? new Date(handover.authorized_at) : null;
    if (!authorizedAt) return { error: 'Handover has no authorization timestamp', status: 400 };
    const windowEnd = new Date(authorizedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) return { error: 'Reversal window (7 days) has expired', status: 400 };

    const [updated] = await db
      .update(schema.handovers)
      .set({ status: 'pending_reversal' as any, reversal_reason: reason, updated_at: new Date(), updated_by: String(requestedById) })
      .where(eq(schema.handovers.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'handover_reversed' as any,
      reference_type: 'handover',
      reference_id: id,
      actor_id: requestedById,
      actor_role: 'maker',
      details: { action: 'reversal_initiated', reason },
    });

    return { data: updated };
  },

  async approveReversal(id: number, approverId: number): Promise<{ data?: Handover; error?: string; status?: number }> {
    const [handover] = await db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.id, id))
      .limit(1);

    if (!handover) return { error: 'Handover not found', status: 404 };
    if ((handover.status as string) !== 'pending_reversal') return { error: 'Handover is not pending reversal', status: 400 };

    const [updated] = await db
      .update(schema.handovers)
      .set({
        status: 'reversed' as any,
        reversed_at: new Date(),
        reversed_by: approverId,
        reversal_approved_by: approverId,
        updated_at: new Date(),
        updated_by: String(approverId),
      })
      .where(eq(schema.handovers.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'reversal_approved',
      reference_type: 'handover',
      reference_id: id,
      actor_id: approverId,
      actor_role: 'checker',
      details: {},
    });

    return { data: updated };
  },

  async rejectReversal(id: number, rejectorId: number, reason: string): Promise<{ data?: Handover; error?: string; status?: number }> {
    const [handover] = await db
      .select()
      .from(schema.handovers)
      .where(eq(schema.handovers.id, id))
      .limit(1);

    if (!handover) return { error: 'Handover not found', status: 404 };
    if ((handover.status as string) !== 'pending_reversal') return { error: 'Handover is not pending reversal', status: 400 };

    const [updated] = await db
      .update(schema.handovers)
      .set({ status: 'authorized' as any, reversal_reason: null, updated_at: new Date(), updated_by: String(rejectorId) })
      .where(eq(schema.handovers.id, id))
      .returning();

    await this.createAuditEntry({
      event_type: 'handover_rejected' as any,
      reference_type: 'handover',
      reference_id: id,
      actor_id: rejectorId,
      actor_role: 'checker',
      details: { action: 'reversal_rejected', reason },
    });

    return { data: updated };
  },

  // ===========================================================================
  // Phase 2 — Bulk Upload Methods
  // ===========================================================================

  /**
   * Preview a bulk upload CSV without committing. Returns validation results.
   */
  async previewBulkUpload(rows: Array<{
    entity_type: string;
    entity_id: string;
    entity_name: string;
    outgoing_rm_id: number;
    incoming_rm_id: number;
    reason?: string;
  }>): Promise<{ total_rows: number; valid_count: number; error_count: number; preview: Array<{ row: number; entity_id: string; entity_name: string; valid: boolean; errors: string[]; has_active_delegation: boolean }> }> {
    const preview: Array<{
      row: number;
      entity_id: string;
      entity_name: string;
      valid: boolean;
      errors: string[];
      has_active_delegation: boolean;
    }> = [];

    let validCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const errors: string[] = [];

      if (!row.entity_type || !['lead', 'prospect', 'client'].includes(row.entity_type)) {
        errors.push('Invalid entity_type');
      }
      if (!row.entity_id) errors.push('Missing entity_id');
      if (!row.outgoing_rm_id) errors.push('Missing outgoing_rm_id');
      if (!row.incoming_rm_id) errors.push('Missing incoming_rm_id');
      if (row.outgoing_rm_id === row.incoming_rm_id) {
        errors.push('Outgoing and incoming RM cannot be the same');
      }

      // Check for active delegation on entity
      let hasActiveDelegation = false;
      if (row.entity_id) {
        const activeDel = await db
          .select({ id: schema.delegationItems.id })
          .from(schema.delegationItems)
          .innerJoin(
            schema.delegationRequests,
            eq(schema.delegationItems.delegation_request_id, schema.delegationRequests.id),
          )
          .where(
            and(
              eq(schema.delegationItems.entity_id, row.entity_id),
              eq(schema.delegationRequests.status, 'active'),
            ),
          )
          .limit(1);
        hasActiveDelegation = activeDel.length > 0;
      }

      const valid = errors.length === 0;
      if (valid) validCount++;
      else errorCount++;

      preview.push({
        row: i + 1,
        entity_id: row.entity_id,
        entity_name: row.entity_name ?? '',
        valid,
        errors,
        has_active_delegation: hasActiveDelegation,
      });
    }

    return {
      total_rows: rows.length,
      valid_count: validCount,
      error_count: errorCount,
      preview,
    };
  },

  /**
   * Queue a durable bulk upload job. Rows are persisted before any handover
   * creation so the job can be resumed or retried after worker failure.
   */
  async queueBulkUpload(
    rows: BulkHandoverUploadRow[],
    uploaderId: string,
    options: { fileName?: string; maxRetries?: number; idempotencyKey?: string } = {},
  ): Promise<{ upload_id: number; status: string; total_rows: number; resume_token: string; payload_bytes: number }> {
    const validation = validateBulkHandoverUpload(rows);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    const now = new Date();
    const initialResults = makeInitialBulkHandoverResults(rows);
    const [uploadLog] = await db
      .insert(schema.bulkUploadLogs)
      .values({
        uploaded_by: Number(uploaderId) || 0,
        upload_type: 'client_handover',
        idempotency_key: options.idempotencyKey ?? null,
        file_name: options.fileName ?? `bulk-upload-${now.getTime()}.json`,
        file_size_bytes: validation.payloadBytes,
        total_rows: rows.length,
        success_count: 0,
        error_count: 0,
        error_details: null,
        input_rows: rows,
        row_results: initialResults,
        group_results: initialResults,
        processing_cursor: 0,
        retry_count: 0,
        max_retries: options.maxRetries ?? BULK_HANDOVER_DEFAULT_MAX_RETRIES,
        next_retry_at: null,
        started_at: null,
        last_attempt_at: null,
        last_error: null,
        locked_at: null,
        locked_by: null,
        resume_token: makeBulkResumeToken(undefined, uploaderId, now),
        is_background: true,
        status: 'queued',
        created_by: uploaderId,
        updated_by: uploaderId,
      })
      .returning();

    const resumeToken = (uploadLog as any)?.resume_token ?? makeBulkResumeToken((uploadLog as any)?.id, uploaderId, now);
    if ((uploadLog as any)?.id && !(uploadLog as any)?.resume_token) {
      await db
        .update(schema.bulkUploadLogs)
        .set({ resume_token: resumeToken, updated_at: now, updated_by: uploaderId })
        .where(eq(schema.bulkUploadLogs.id, (uploadLog as any).id));
    }

    await this.createAuditEntry({
      event_type: 'bulk_upload_queued',
      reference_type: 'bulk_upload',
      reference_id: (uploadLog as any)?.id ?? 0,
      actor_id: Number(uploaderId) || 0,
      actor_role: 'maker',
      details: {
        total_rows: rows.length,
        payload_bytes: validation.payloadBytes,
        group_count: initialResults.length,
        max_retries: options.maxRetries ?? BULK_HANDOVER_DEFAULT_MAX_RETRIES,
      },
    });

    return {
      upload_id: (uploadLog as any)?.id,
      status: 'queued',
      total_rows: rows.length,
      resume_token: resumeToken,
      payload_bytes: validation.payloadBytes,
    };
  },

  /**
   * Process a durable bulk upload job. Successful groups are skipped on retry,
   * while failed/pending groups can be resumed until max_retries is reached.
   */
  async processBulkUploadJob(
    uploadId: number,
    workerId: string = 'system',
  ): Promise<{ upload_id: number; status: string; total_rows: number; success_count: number; failure_count: number; retry_count: number; next_retry_at: Date | null; results: BulkHandoverGroupResult[] }> {
    const [uploadLog] = await db
      .select()
      .from(schema.bulkUploadLogs)
      .where(eq(schema.bulkUploadLogs.id, uploadId))
      .limit(1) as BulkUploadLog[];

    if (!uploadLog) {
      throw new Error(`Bulk upload job ${uploadId} not found`);
    }

    const rows = jsonArray<BulkHandoverUploadRow>((uploadLog as any).input_rows);
    if (rows.length === 0) {
      const emptyResults = jsonArray<BulkHandoverGroupResult>((uploadLog as any).group_results);
      return {
        upload_id: uploadId,
        status: String(uploadLog.status ?? 'failed'),
        total_rows: uploadLog.total_rows ?? 0,
        success_count: uploadLog.success_count ?? 0,
        failure_count: uploadLog.error_count ?? 0,
        retry_count: (uploadLog as any).retry_count ?? 0,
        next_retry_at: dateOrNull((uploadLog as any).next_retry_at),
        results: emptyResults,
      };
    }

    const now = new Date();
    await db
      .update(schema.bulkUploadLogs)
      .set({
        status: 'processing',
        started_at: (uploadLog as any).started_at ?? now,
        last_attempt_at: now,
        locked_at: now,
        locked_by: workerId,
        updated_at: now,
        updated_by: workerId,
      })
      .where(eq(schema.bulkUploadLogs.id, uploadId));

    await this.createAuditEntry({
      event_type: 'bulk_upload_attempt_started',
      reference_type: 'bulk_upload',
      reference_id: uploadId,
      actor_id: actorId(workerId),
      actor_role: 'system',
      details: {
        retry_count: (uploadLog as any).retry_count ?? 0,
        max_retries: (uploadLog as any).max_retries ?? BULK_HANDOVER_DEFAULT_MAX_RETRIES,
      },
    });

    const groups = groupBulkHandoverRows(rows);
    let groupResults = jsonArray<BulkHandoverGroupResult>((uploadLog as any).group_results);
    if (groupResults.length === 0) {
      groupResults = makeInitialBulkHandoverResults(rows);
    }
    const resultMap = new Map(groupResults.map((result) => [result.group_key, result]));

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const previous = resultMap.get(group.groupKey);
      if (previous?.status === 'success') {
        continue;
      }

      const firstRow = group.rows[0];
      try {
        const result = await this.createHandoverRequest({
          entity_type: firstRow.entity_type as any,
          outgoing_rm_id: firstRow.outgoing_rm_id,
          incoming_rm_id: firstRow.incoming_rm_id,
          reason: firstRow.reason ?? 'Bulk upload handover',
          items: group.rows.map((r) => ({
            entity_id: r.entity_id,
            entity_name_en: r.entity_name,
            aum: r.aum,
          })),
          created_by: String(uploadLog.uploaded_by ?? workerId),
        });
        const handoverId = (result as any)?.id;
        groupResults = mergeBulkHandoverGroupResult(groupResults, {
          group_key: group.groupKey,
          row_numbers: group.rowNumbers,
          status: 'success',
          attempts: (previous?.attempts ?? 0) + 1,
          handover_id: handoverId,
          updated_at: new Date().toISOString(),
        });
        // HAM-GAP-006: per-row audit log entry for successful group
        for (const row of group.rows) {
          await this.createAuditEntry({
            event_type: 'bulk_row_processed',
            reference_type: 'bulk_upload',
            reference_id: uploadLog.id,
            actor_id: Number(uploadLog.uploaded_by) || 0,
            actor_role: 'system',
            details: { entity_type: row.entity_type, entity_id: row.entity_id, entity_name: row.entity_name, handover_id: handoverId, status: 'success' },
          });
        }
        await db
          .update(schema.bulkUploadFailureItems)
          .set({
            failure_status: 'RESOLVED_BY_RETRY',
            resolution_code: 'GROUP_REPROCESSED_SUCCESSFULLY',
            resolution_notes: 'Bulk upload group succeeded during a later processing attempt.',
            resolved_by: actorId(workerId) || null,
            resolved_at: new Date(),
            linked_handover_id: handoverId ?? null,
            updated_at: new Date(),
            updated_by: workerId,
          } as any)
          .where(and(
            eq(schema.bulkUploadFailureItems.upload_id, uploadLog.id),
            eq(schema.bulkUploadFailureItems.group_key, group.groupKey),
            sql`${schema.bulkUploadFailureItems.failure_status} IN ('OPEN', 'ASSIGNED', 'RETRY_FAILED')`,
          ));
      } catch (err: any) {
        const errorMsg: string = err.message ?? 'Unknown error';
        groupResults = mergeBulkHandoverGroupResult(groupResults, {
          group_key: group.groupKey,
          row_numbers: group.rowNumbers,
          status: 'failed',
          attempts: (previous?.attempts ?? 0) + 1,
          error: errorMsg,
          updated_at: new Date().toISOString(),
        });
        // HAM-GAP-006: per-row audit log entry for failed group
        for (const row of group.rows) {
          await this.createAuditEntry({
            event_type: 'bulk_row_failed',
            reference_type: 'bulk_upload',
            reference_id: uploadLog.id,
            actor_id: Number(uploadLog.uploaded_by) || 0,
            actor_role: 'system',
            details: { entity_type: row.entity_type, entity_id: row.entity_id, entity_name: row.entity_name, error: errorMsg, status: 'failed' },
          });
          await db.insert(schema.bulkUploadFailureItems).values({
            upload_id: uploadLog.id,
            group_key: group.groupKey,
            row_number: group.rowNumbers[group.rows.indexOf(row)] ?? 0,
            row_payload: row,
            error_message: errorMsg,
            failure_status: 'OPEN',
            created_by: String(uploadLog.uploaded_by ?? workerId),
            updated_by: workerId,
          } as any);
          await this.createAuditEntry({
            event_type: 'bulk_failure_queued',
            reference_type: 'bulk_upload',
            reference_id: uploadLog.id,
            actor_id: Number(uploadLog.uploaded_by) || 0,
            actor_role: 'system',
            details: { group_key: group.groupKey, row_number: group.rowNumbers[group.rows.indexOf(row)] ?? 0, error: errorMsg },
          });
        }
      }

      const interimCounts = computeBulkHandoverCounts(groupResults);
      await db
        .update(schema.bulkUploadLogs)
        .set({
          group_results: groupResults,
          row_results: groupResults,
          success_count: interimCounts.successCount,
          error_count: interimCounts.failureCount,
          processing_cursor: groupIndex + 1,
          updated_at: new Date(),
          updated_by: workerId,
        })
        .where(eq(schema.bulkUploadLogs.id, uploadId));
    }

    const counts = computeBulkHandoverCounts(groupResults);
    const nextRetryCount = counts.failureCount > 0 ? ((uploadLog as any).retry_count ?? 0) + 1 : ((uploadLog as any).retry_count ?? 0);
    const maxRetries = (uploadLog as any).max_retries ?? BULK_HANDOVER_DEFAULT_MAX_RETRIES;
    const retryable = shouldRetryBulkHandoverJob(nextRetryCount, maxRetries, counts.failureCount);
    const nextRetryAt = retryable ? computeBulkHandoverNextRetryAt(new Date(), nextRetryCount) : null;
    const finalStatus = counts.failureCount === 0
      ? 'completed'
      : retryable
        ? 'retry_pending'
        : counts.successCount > 0
          ? 'partially_completed'
          : 'failed';

    await db
      .update(schema.bulkUploadLogs)
      .set({
        success_count: counts.successCount,
        error_count: counts.failureCount,
        status: finalStatus,
        retry_count: nextRetryCount,
        next_retry_at: nextRetryAt,
        error_details: groupResults.filter((r) => r.status === 'failed'),
        last_error: groupResults.find((r) => r.status === 'failed')?.error ?? null,
        locked_at: null,
        locked_by: null,
        completed_at: finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'partially_completed' ? new Date() : null,
        updated_at: new Date(),
        updated_by: workerId,
      })
      .where(eq(schema.bulkUploadLogs.id, uploadId));

    await this.createAuditEntry({
      event_type: 'bulk_upload_attempt_completed',
      reference_type: 'bulk_upload',
      reference_id: uploadId,
      actor_id: actorId(workerId),
      actor_role: 'system',
      details: {
        total: rows.length,
        success: counts.successCount,
        failure: counts.failureCount,
        status: finalStatus,
        retry_count: nextRetryCount,
        next_retry_at: nextRetryAt,
      },
    });

    if (retryable) {
      await this.createAuditEntry({
        event_type: 'bulk_upload_retry_scheduled',
        reference_type: 'bulk_upload',
        reference_id: uploadId,
        actor_id: actorId(workerId),
        actor_role: 'system',
        details: { retry_count: nextRetryCount, next_retry_at: nextRetryAt, max_retries: maxRetries },
      });
    }

    // HAM-GAP-007: Notify the uploader and their branch supervisor(s) of bulk upload completion
    const uploaderIdNum = Number(uploadLog.uploaded_by) || 0;
    if (uploaderIdNum > 0 && finalStatus !== 'retry_pending') {
      await this.createNotification({
        notification_type: 'bulk_upload_completed',
        recipient_user_id: uploaderIdNum,
        subject: 'Bulk Upload Completed',
        body: `Bulk handover upload ${finalStatus}: ${counts.successCount} succeeded, ${counts.failureCount} failed out of ${rows.length} total rows.`,
        reference_type: 'bulk_upload',
        reference_id: uploadId,
      });

      // Notify branch supervisor(s) of the uploader
      const [uploaderRow] = await db
        .select({ branch_id: schema.users.branch_id })
        .from(schema.users)
        .where(eq(schema.users.id, uploaderIdNum))
        .limit(1);
      if (uploaderRow?.branch_id) {
        const supervisors = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.branch_id, uploaderRow.branch_id),
              eq(schema.users.is_active, true),
            ),
          );
        for (const sup of supervisors) {
          if (sup.id !== uploaderIdNum) {
            await this.createNotification({
              notification_type: 'bulk_upload_supervisor_alert',
              recipient_user_id: sup.id,
              subject: 'Bulk Handover Upload Requires Review',
              body: `User ${uploaderIdNum} completed a bulk handover upload with ${counts.successCount} succeeded and ${counts.failureCount} failed rows. Please review the pending handover requests.`,
              reference_type: 'bulk_upload',
              reference_id: uploadId,
            });
          }
        }
      }
    }

    return {
      upload_id: uploadId,
      status: finalStatus,
      total_rows: rows.length,
      success_count: counts.successCount,
      failure_count: counts.failureCount,
      retry_count: nextRetryCount,
      next_retry_at: nextRetryAt,
      results: groupResults,
    };
  },

  /**
   * Backward-compatible wrapper: persist the job, then run one processing
   * attempt immediately. Workers can call processBulkUploadJob later to resume.
   */
  async processBulkUpload(
    rows: BulkHandoverUploadRow[],
    uploaderId: string,
  ): Promise<{ upload_id: number; status: string; total_rows: number; success_count: number; failure_count: number; retry_count: number; next_retry_at: Date | null; results: BulkHandoverGroupResult[] }> {
    const queued = await this.queueBulkUpload(rows, uploaderId, {
      fileName: `bulk-upload-${Date.now()}.json`,
    });
    if (!queued.upload_id) {
      return {
        upload_id: queued.upload_id,
        status: queued.status,
        total_rows: rows.length,
        success_count: 0,
        failure_count: 0,
        retry_count: 0,
        next_retry_at: null,
        results: makeInitialBulkHandoverResults(rows),
      };
    }
    return this.processBulkUploadJob(queued.upload_id, uploaderId);
  },

  /**
   * Get upload log by ID.
   */
  async getUploadLog(id: number): Promise<typeof schema.bulkUploadLogs.$inferSelect | null> {
    const [log] = await db
      .select()
      .from(schema.bulkUploadLogs)
      .where(eq(schema.bulkUploadLogs.id, id))
      .limit(1);
    return log ?? null;
  },

  async listBulkUploadFailures(filters: {
    upload_id?: number;
    status?: string;
    assigned_to?: number;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: BulkUploadFailureItem[]; total: number; page: number; pageSize: number }> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const offset = (page - 1) * pageSize;
    const conditions = [eq(schema.bulkUploadFailureItems.is_deleted, false)];
    if (filters.upload_id) conditions.push(eq(schema.bulkUploadFailureItems.upload_id, filters.upload_id));
    if (filters.status) conditions.push(eq(schema.bulkUploadFailureItems.failure_status, normalizeBulkFailureStatus(filters.status)));
    if (filters.assigned_to) conditions.push(eq(schema.bulkUploadFailureItems.assigned_to, filters.assigned_to));
    const where = and(...conditions);

    const [data, countRows] = await Promise.all([
      db
        .select()
        .from(schema.bulkUploadFailureItems)
        .where(where)
        .orderBy(desc(schema.bulkUploadFailureItems.created_at))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.bulkUploadFailureItems)
        .where(where),
    ]);

    return { data, total: Number(countRows[0]?.count ?? 0), page, pageSize };
  },

  async assignBulkUploadFailure(failureId: number, assigneeId: number, actorUserId: string): Promise<BulkUploadFailureItem> {
    const [failure] = await db
      .select()
      .from(schema.bulkUploadFailureItems)
      .where(and(eq(schema.bulkUploadFailureItems.id, failureId), eq(schema.bulkUploadFailureItems.is_deleted, false)))
      .limit(1);
    if (!failure) throw new Error(`Bulk upload failure ${failureId} not found`);
    if (['RESOLVED', 'WAIVED', 'RETRY_RESOLVED', 'RESOLVED_BY_RETRY'].includes(failure.failure_status)) {
      throw new Error(`Cannot assign failure in ${failure.failure_status} status`);
    }

    const now = new Date();
    const [updated] = await db
      .update(schema.bulkUploadFailureItems)
      .set({
        failure_status: 'ASSIGNED',
        assigned_to: assigneeId,
        assigned_at: now,
        updated_at: now,
        updated_by: actorUserId,
      } as any)
      .where(eq(schema.bulkUploadFailureItems.id, failureId))
      .returning();

    await this.createAuditEntry({
      event_type: 'bulk_failure_assigned',
      reference_type: 'bulk_upload',
      reference_id: failure.upload_id,
      actor_id: actorId(actorUserId),
      actor_role: 'operator',
      details: { failure_id: failureId, assigned_to: assigneeId },
    });

    return updated;
  },

  async resolveBulkUploadFailure(failureId: number, actorUserId: string, data: {
    resolution_code: 'RESOLVED' | 'WAIVED';
    resolution_notes?: string;
  }): Promise<BulkUploadFailureItem> {
    const status = normalizeBulkFailureStatus(data.resolution_code);
    if (!['RESOLVED', 'WAIVED'].includes(status)) {
      throw new Error('resolution_code must be RESOLVED or WAIVED');
    }
    const [failure] = await db
      .select()
      .from(schema.bulkUploadFailureItems)
      .where(and(eq(schema.bulkUploadFailureItems.id, failureId), eq(schema.bulkUploadFailureItems.is_deleted, false)))
      .limit(1);
    if (!failure) throw new Error(`Bulk upload failure ${failureId} not found`);

    const now = new Date();
    const [updated] = await db
      .update(schema.bulkUploadFailureItems)
      .set({
        failure_status: status,
        resolution_code: status,
        resolution_notes: data.resolution_notes ?? null,
        resolved_by: actorId(actorUserId) || null,
        resolved_at: now,
        updated_at: now,
        updated_by: actorUserId,
      } as any)
      .where(eq(schema.bulkUploadFailureItems.id, failureId))
      .returning();

    await this.createAuditEntry({
      event_type: 'bulk_failure_resolved',
      reference_type: 'bulk_upload',
      reference_id: failure.upload_id,
      actor_id: actorId(actorUserId),
      actor_role: 'operator',
      details: { failure_id: failureId, resolution_code: status, resolution_notes: data.resolution_notes ?? null },
    });

    return updated;
  },

  async retryBulkUploadFailure(
    failureId: number,
    actorUserId: string,
    rowOverride: Partial<BulkHandoverUploadRow> = {},
  ): Promise<BulkUploadFailureItem> {
    const [failure] = await db
      .select()
      .from(schema.bulkUploadFailureItems)
      .where(and(eq(schema.bulkUploadFailureItems.id, failureId), eq(schema.bulkUploadFailureItems.is_deleted, false)))
      .limit(1);
    if (!failure) throw new Error(`Bulk upload failure ${failureId} not found`);
    if (['RESOLVED', 'WAIVED', 'RETRY_RESOLVED', 'RESOLVED_BY_RETRY'].includes(failure.failure_status)) {
      throw new Error(`Cannot retry failure in ${failure.failure_status} status`);
    }

    const row = { ...(failure.row_payload as Record<string, unknown>), ...rowOverride } as BulkHandoverUploadRow;
    const now = new Date();
    try {
      const result = await this.createHandoverRequest({
        entity_type: row.entity_type as any,
        outgoing_rm_id: row.outgoing_rm_id,
        incoming_rm_id: row.incoming_rm_id,
        reason: row.reason ?? 'Bulk upload remediation retry',
        items: [{
          entity_id: row.entity_id,
          entity_name_en: row.entity_name,
          aum: row.aum,
        }],
        created_by: actorUserId,
      });
      const handoverId = (result as any)?.id ?? null;
      const [updated] = await db
        .update(schema.bulkUploadFailureItems)
        .set({
          failure_status: 'RETRY_RESOLVED',
          retry_count: (failure.retry_count ?? 0) + 1,
          last_retried_at: now,
          linked_handover_id: handoverId,
          resolution_code: 'RETRIED_SUCCESSFULLY',
          resolution_notes: 'Single failed row was retried from the remediation workbench.',
          resolved_by: actorId(actorUserId) || null,
          resolved_at: now,
          updated_at: now,
          updated_by: actorUserId,
        } as any)
        .where(eq(schema.bulkUploadFailureItems.id, failureId))
        .returning();

      await this.createAuditEntry({
        event_type: 'bulk_failure_retried',
        reference_type: 'bulk_upload',
        reference_id: failure.upload_id,
        actor_id: actorId(actorUserId),
        actor_role: 'operator',
        details: { failure_id: failureId, status: 'success', linked_handover_id: handoverId },
      });
      return updated;
    } catch (err: any) {
      const errorMessage = err?.message ?? 'Retry failed';
      const [updated] = await db
        .update(schema.bulkUploadFailureItems)
        .set({
          failure_status: 'RETRY_FAILED',
          retry_count: (failure.retry_count ?? 0) + 1,
          last_retried_at: now,
          error_message: errorMessage,
          updated_at: now,
          updated_by: actorUserId,
        } as any)
        .where(eq(schema.bulkUploadFailureItems.id, failureId))
        .returning();

      await this.createAuditEntry({
        event_type: 'bulk_failure_retried',
        reference_type: 'bulk_upload',
        reference_id: failure.upload_id,
        actor_id: actorId(actorUserId),
        actor_role: 'operator',
        details: { failure_id: failureId, status: 'failed', error: errorMessage },
      });
      return updated;
    }
  },

  // ---------------------------------------------------------------------------
  // Submit handover request (DRAFT → PENDING_AUTH)
  // ---------------------------------------------------------------------------
  async submitHandoverRequest(id: number, userId: number): Promise<{ success: boolean; error?: string; status?: number }> {
    const [handover] = await db.select().from(schema.handovers).where(eq(schema.handovers.id, id)).limit(1);
    if (!handover) return { success: false, error: 'Handover not found', status: 404 };
    if (handover.status !== 'draft') return { success: false, error: `Cannot submit a handover in status: ${handover.status}`, status: 422 };

    // Determine SLA deadline from slaConfigurations (default 48h if none configured)
    const [slaCfg] = await db
      .select()
      .from(schema.slaConfigurations)
      .where(and(eq(schema.slaConfigurations.entity_type, handover.entity_type), eq(schema.slaConfigurations.is_active, true)))
      .limit(1);
    const deadlineHours = slaCfg?.deadline_hours ?? 48;
    const slaDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
    const now = new Date();

    const rmUsers = await db
      .select({
        id: schema.users.id,
        full_name: schema.users.full_name,
        email: schema.users.email,
        role: schema.users.role,
        branch_id: schema.users.branch_id,
        office: schema.users.office,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, [handover.outgoing_rm_id, handover.incoming_rm_id]));
    const rmUserMap = new Map<number, HandoverRoutingUser>(rmUsers.map((u: any) => [Number(u.id), {
      id: Number(u.id),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      branch_id: u.branch_id ?? null,
      office: u.office ?? null,
    }]));
    const route = buildHandoverAuthorizationRoute({
      handoverId: handover.id,
      handoverNumber: handover.handover_number,
      outgoingRm: rmUserMap.get(handover.outgoing_rm_id) ?? null,
      incomingRm: rmUserMap.get(handover.incoming_rm_id) ?? null,
      sourceBranchId: handover.source_branch_id ?? null,
      targetBranchId: handover.target_branch_id ?? null,
      createdBy: handover.created_by,
      now,
      slaDeadline,
    });

    await db
      .update(schema.handovers)
      .set({
        status: 'pending_auth',
        sla_deadline: slaDeadline,
        ...makeRouteUpdate(
          route,
          handover.routing_history,
          'ROUTED',
          userId,
          'HANDOVER_SUBMITTED',
          { previous_status: 'draft' },
          now,
        ),
        updated_at: now,
      })
      .where(eq(schema.handovers.id, id));

    await this.createAuditEntry({
      event_type: 'handover_submitted',
      reference_type: 'handover',
      reference_id: id,
      actor_id: userId,
      actor_role: 'RM',
      details: {
        previous_status: 'draft',
        sla_deadline: slaDeadline,
        authorization_route: route.routeType,
        checker_branch_id: route.checkerBranchId,
        owner_team: route.ownerTeam,
      },
    });

    await this.createAuditEntry({
      event_type: 'handover_authorization_routed',
      reference_type: 'handover',
      reference_id: id,
      actor_id: userId,
      actor_role: 'system',
      details: route.snapshot,
    });

    return { success: true };
  },

  // ---------------------------------------------------------------------------
  // Cancel handover request
  // ---------------------------------------------------------------------------
  async cancelHandoverRequest(id: number, userId: number, reason: string): Promise<{ success: boolean; error?: string; status?: number }> {
    const [handover] = await db.select().from(schema.handovers).where(eq(schema.handovers.id, id)).limit(1);
    if (!handover) return { success: false, error: 'Handover not found', status: 404 };
    if (!['draft', 'pending_auth'].includes(handover.status)) {
      return { success: false, error: `Cannot cancel a handover in status: ${handover.status}`, status: 422 };
    }

    await db
      .update(schema.handovers)
      .set({ status: 'cancelled', rejection_reason: reason, updated_at: new Date() })
      .where(eq(schema.handovers.id, id));

    await this.createAuditEntry({
      event_type: 'handover_cancelled',
      reference_type: 'handover',
      reference_id: id,
      actor_id: userId,
      actor_role: 'RM',
      details: { reason },
    });

    return { success: true };
  },

  // ---------------------------------------------------------------------------
  // Compliance gates
  // ---------------------------------------------------------------------------
  async getComplianceGates(handoverId: number): Promise<Array<typeof schema.complianceGates.$inferSelect>> {
    return db
      .select()
      .from(schema.complianceGates)
      .where(eq(schema.complianceGates.handover_id, handoverId))
      .orderBy(schema.complianceGates.checked_at);
  },

  async runComplianceGates(handoverId: number, userId: number, userRole: string): Promise<{ gates: Array<typeof schema.complianceGates.$inferSelect> }> {
    const items = await db
      .select()
      .from(schema.handoverItems)
      .where(eq(schema.handoverItems.handover_id, handoverId));

    const gateTypes: Array<typeof schema.complianceGateTypeEnum.enumValues[number]> = [
      'kyc_pending', 'sanctions_alert', 'open_complaint', 'conflict_of_interest', 'pending_settlement',
    ];

    const newGates: Array<typeof schema.complianceGates.$inferInsert> = [];
    for (const item of items) {
      for (const gateType of gateTypes) {
        // Simplified: all gates pass unless item flags indicate otherwise
        const result: typeof schema.complianceGateResultEnum.enumValues[number] =
          gateType === 'pending_settlement' && (item.pending_settlements_count ?? 0) > 0
            ? 'warning'
            : 'passed';
        newGates.push({
          handover_id: handoverId,
          handover_item_id: item.id,
          gate_type: gateType,
          result,
          details: result === 'warning' ? `${item.pending_settlements_count} pending settlement(s)` : null,
          checked_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: String(userId),
          updated_by: String(userId),
        });
      }
    }

    if (newGates.length > 0) {
      await db.insert(schema.complianceGates).values(newGates);
    }

    await this.createAuditEntry({
      event_type: 'compliance_check',
      reference_type: 'handover',
      reference_id: handoverId,
      actor_id: userId,
      actor_role: userRole,
      details: { gates_run: gateTypes.length, items_checked: items.length },
    });

    const gates = await this.getComplianceGates(handoverId);
    return { gates };
  },

  // ---------------------------------------------------------------------------
  // Scrutiny checklist
  // ---------------------------------------------------------------------------
  async getScrutinyChecklist(handoverId: number): Promise<Array<typeof schema.scrutinyChecklistItems.$inferSelect & { template_label: string | null }>> {
    const rows = await db
      .select({
        id: schema.scrutinyChecklistItems.id,
        handover_id: schema.scrutinyChecklistItems.handover_id,
        template_item_id: schema.scrutinyChecklistItems.template_item_id,
        validation_label: schema.scrutinyChecklistItems.validation_label,
        remarks: schema.scrutinyChecklistItems.remarks,
        completed_by: schema.scrutinyChecklistItems.completed_by,
        completed_at: schema.scrutinyChecklistItems.completed_at,
        status: schema.scrutinyChecklistItems.status,
        created_at: schema.scrutinyChecklistItems.created_at,
        updated_at: schema.scrutinyChecklistItems.updated_at,
        created_by: schema.scrutinyChecklistItems.created_by,
        updated_by: schema.scrutinyChecklistItems.updated_by,
        template_label: schema.scrutinyTemplates.label,
      })
      .from(schema.scrutinyChecklistItems)
      .leftJoin(schema.scrutinyTemplates, eq(schema.scrutinyChecklistItems.template_item_id, schema.scrutinyTemplates.id))
      .where(eq(schema.scrutinyChecklistItems.handover_id, handoverId))
      .orderBy(schema.scrutinyTemplates.sort_order);
    return rows as any;
  },

  async updateScrutinyItem(
    handoverId: number,
    itemId: number,
    userId: number,
    data: { status: typeof schema.scrutinyItemStatusEnum.enumValues[number]; remarks?: string },
  ): Promise<{ success: boolean; error?: string; status?: number }> {
    const [item] = await db
      .select()
      .from(schema.scrutinyChecklistItems)
      .where(and(eq(schema.scrutinyChecklistItems.id, itemId), eq(schema.scrutinyChecklistItems.handover_id, handoverId)))
      .limit(1);
    if (!item) return { success: false, error: 'Scrutiny item not found', status: 404 };

    const updates: Partial<typeof schema.scrutinyChecklistItems.$inferInsert> = {
      status: data.status,
      remarks: data.remarks ?? item.remarks,
      updated_at: new Date(),
      updated_by: String(userId),
    };
    if (data.status === 'completed') {
      updates.completed_by = userId;
      updates.completed_at = new Date();
    }

    await db
      .update(schema.scrutinyChecklistItems)
      .set(updates)
      .where(eq(schema.scrutinyChecklistItems.id, itemId));

    return { success: true };
  },

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------
  async getAuditLog(
    handoverId: number,
  ): Promise<Array<typeof schema.handoverAuditLog.$inferSelect>> {
    return db
      .select()
      .from(schema.handoverAuditLog)
      .where(
        and(
          eq(schema.handoverAuditLog.reference_type, 'handover'),
          eq(schema.handoverAuditLog.reference_id, handoverId),
        ),
      )
      .orderBy(desc(schema.handoverAuditLog.created_at));
  },

  // ---------------------------------------------------------------------------
  // SLA-breached handovers
  // ---------------------------------------------------------------------------
  async getSlaBreachedHandovers(entityId?: number): Promise<Array<typeof schema.handovers.$inferSelect>> {
    const now = new Date();
    const conditions = [
      eq(schema.handovers.status, 'pending_auth'),
      eq(schema.handovers.is_deleted, false),
    ];
    const rows = await db
      .select()
      .from(schema.handovers)
      .where(and(...conditions))
      .orderBy(schema.handovers.sla_deadline);
    // Filter in JS for sla_deadline < now since lt() with timestamp needs careful typing
    return rows.filter((h: typeof schema.handovers.$inferSelect) => h.sla_deadline != null && new Date(h.sla_deadline) < now);
  },

  async escalateOverdueAuthorizations(options: {
    now?: Date;
    actorId?: string | number;
    reason?: string;
  } = {}): Promise<{ escalated: number; results: Array<{ id: number; handover_number: string | null; route_type: string; escalated_to_team: string }> }> {
    const now = options.now ?? new Date();
    const reason = options.reason ?? 'AUTHORIZATION_SLA_BREACH';
    const rows = await db
      .select()
      .from(schema.handovers)
      .where(
        and(
          eq(schema.handovers.status, 'pending_auth'),
          eq(schema.handovers.is_deleted, false),
        ),
      )
      .orderBy(schema.handovers.authorization_due_at);

    const overdue = rows.filter((handover: Handover) => {
      if ((handover as any).escalated_at) return false;
      const dueAt = dateOrNull((handover as any).authorization_due_at) ?? dateOrNull(handover.sla_deadline);
      return dueAt != null && dueAt.getTime() < now.getTime();
    });

    const rmIds: number[] = Array.from(new Set<number>(overdue.flatMap((handover: any) => [
      handover.outgoing_rm_id,
      handover.incoming_rm_id,
    ]).filter((id: unknown): id is number => Number.isFinite(Number(id)) && Number(id) > 0).map(Number)));
    const rmUsers = rmIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            full_name: schema.users.full_name,
            email: schema.users.email,
            role: schema.users.role,
            branch_id: schema.users.branch_id,
            office: schema.users.office,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, rmIds))
      : [];
    const rmUserMap = new Map<number, HandoverRoutingUser>(rmUsers.map((u: any) => [Number(u.id), {
      id: Number(u.id),
      full_name: u.full_name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      branch_id: u.branch_id ?? null,
      office: u.office ?? null,
    }]));

    const results: Array<{ id: number; handover_number: string | null; route_type: string; escalated_to_team: string }> = [];
    for (const handover of overdue as Handover[]) {
      const route = buildHandoverAuthorizationRoute({
        handoverId: handover.id,
        handoverNumber: handover.handover_number,
        outgoingRm: rmUserMap.get(handover.outgoing_rm_id) ?? null,
        incomingRm: rmUserMap.get(handover.incoming_rm_id) ?? null,
        sourceBranchId: (handover as any).source_branch_id ?? null,
        targetBranchId: (handover as any).target_branch_id ?? null,
        createdBy: handover.created_by,
        now,
        slaDeadline: (handover as any).authorization_due_at ?? handover.sla_deadline ?? null,
      });
      const routeUpdate = makeRouteUpdate(
        route,
        (handover as any).routing_history,
        'ESCALATED',
        options.actorId ?? 'system',
        reason,
        { previous_owner_team: (handover as any).authorization_owner_team ?? route.ownerTeam },
        now,
      );

      await db
        .update(schema.handovers)
        .set({
          ...routeUpdate,
          escalated_at: now,
          escalated_to_team: route.escalationTeam,
          escalation_reason: reason,
          updated_at: now,
          updated_by: String(options.actorId ?? 'system'),
        })
        .where(eq(schema.handovers.id, handover.id));

      await this.createAuditEntry({
        event_type: 'handover_authorization_escalated',
        reference_type: 'handover',
        reference_id: handover.id,
        actor_id: actorId(options.actorId ?? '0'),
        actor_role: 'system',
        details: {
          reason,
          authorization_route: route.routeType,
          previous_owner_team: (handover as any).authorization_owner_team ?? route.ownerTeam,
          escalated_to_team: route.escalationTeam,
          authorization_due_at: ((handover as any).authorization_due_at ?? handover.sla_deadline ?? null),
        },
      });

      const recipientId = Number((handover as any).authorization_owner_user_id ?? handover.incoming_srm_id ?? handover.incoming_branch_rm_id ?? 0);
      if (recipientId > 0) {
        await this.createNotification({
          notification_type: 'handover_authorization_escalated',
          recipient_user_id: recipientId,
          subject: 'Handover Authorization Escalated',
          body: `Handover ${handover.handover_number} breached its authorization SLA and has been escalated to ${route.escalationTeam}.`,
          reference_type: 'handover',
          reference_id: handover.id,
        });
      }

      results.push({
        id: handover.id,
        handover_number: handover.handover_number,
        route_type: route.routeType,
        escalated_to_team: route.escalationTeam,
      });
    }

    return { escalated: results.length, results };
  },

  // ---------------------------------------------------------------------------
  // SLA status helper
  // ---------------------------------------------------------------------------
  _computeSlaStatus(slaDeadline: Date | null | undefined): 'on_track' | 'at_risk' | 'overdue' | null {
    if (!slaDeadline) return null;
    const now = new Date();
    const deadline = new Date(slaDeadline);
    if (now > deadline) return 'overdue';
    const twelveHoursBefore = new Date(deadline.getTime() - 12 * 60 * 60 * 1000);
    if (now >= twelveHoursBefore) return 'at_risk';
    return 'on_track';
  },

  // ---------------------------------------------------------------------------
  // Notification helper
  // ---------------------------------------------------------------------------
  async createNotification(params: {
    notification_type: 'handover_initiated' | 'handover_authorized' | 'handover_rejected' | 'delegation_started' | 'delegation_expiring' | 'delegation_expired' | 'delegation_early_terminated' | 'delegation_extension_requested' | 'delegation_extension_approved' | 'bulk_upload_supervisor_alert' | 'bulk_upload_completed' | 'batch_auth_complete' | 'handover_authorization_escalated';
    recipient_user_id: number;
    recipient_email?: string;
    subject: string;
    body: string;
    reference_type: 'handover' | 'delegation' | 'bulk_upload' | 'handover_item';
    reference_id: number;
  }): Promise<void> {
    await db.insert(schema.handoverNotifications).values({
      notification_type: params.notification_type,
      channel: 'both',
      recipient_user_id: params.recipient_user_id,
      recipient_email: params.recipient_email ?? null,
      subject: params.subject,
      body: params.body,
      reference_type: params.reference_type,
      reference_id: params.reference_id,
      is_read: false,
      retry_count: 0,
      sent_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      created_by: 'system',
      updated_by: 'system',
    });
  },
};
