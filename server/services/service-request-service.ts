/**
 * Service Request / Task Management Service
 *
 * Manages the full lifecycle of service requests:
 * NEW → APPROVED → READY_FOR_TELLER → COMPLETED
 *                                    → INCOMPLETE → (re-submit) → READY_FOR_TELLER
 *                                    → REJECTED
 * Any open status → CLOSED
 *
 * SLA: HIGH=3d, MEDIUM=5d, LOW=7d
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, or, ilike, count } from 'drizzle-orm';
import { notificationInboxService } from './notification-inbox-service';

const SLA_DAYS: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 5,
  LOW: 7,
};

function computeClosureDate(priority: string, fromDate?: Date): Date {
  const base = fromDate ?? new Date();
  const days = SLA_DAYS[priority] ?? 5;
  const closure = new Date(base);
  closure.setDate(closure.getDate() + days);
  return closure;
}

function generateRequestId(seq: number): string {
  const year = new Date().getFullYear();
  return `SR-${year}-${String(seq).padStart(6, '0')}`;
}

/** Insert an append-only status history record */
async function insertStatusHistory(
  srId: number,
  fromStatus: string | null,
  toStatus: string,
  action: string,
  changedBy: string,
  notes?: string,
) {
  await db.insert(schema.srStatusHistory).values({
    sr_id: srId,
    from_status: fromStatus as any,
    to_status: toStatus as any,
    action: action as any,
    changed_by: changedBy,
    changed_at: new Date(),
    notes: notes || null,
  });
}

export const serviceRequestService = {
  /** Create a new service request; auto-generates request_id and computes SLA closure date */
  async createServiceRequest(data: {
    client_id: string;
    sr_type: string;
    sr_details?: string;
    priority?: string;
    remarks?: string;
    documents?: string[];
    created_by: string;
    assigned_rm_id?: number;
  }) {
    const year = new Date().getFullYear();
    const prefix = `SR-${year}-`;

    // SR G-010: auto-populate assigned_rm_id from the client record if not provided
    let resolvedRmId = data.assigned_rm_id || null;
    if (!resolvedRmId) {
      const [clientRow] = await db
        .select({ assigned_rm_id: schema.clients.assigned_rm_id })
        .from(schema.clients)
        .where(eq(schema.clients.client_id, data.client_id))
        .limit(1);
      if (clientRow?.assigned_rm_id) {
        resolvedRmId = clientRow.assigned_rm_id;
      }
    }

    // Use MAX-based ID generation with retry on unique constraint violation
    let result: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const maxResult = await db
        .select({ maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${schema.serviceRequests.request_id} FROM 9) AS INTEGER)), 0)` })
        .from(schema.serviceRequests)
        .where(sql`${schema.serviceRequests.request_id} LIKE ${prefix + '%'}`);
      const seq = Number(maxResult[0]?.maxSeq ?? 0) + 1;
      const requestId = generateRequestId(seq);

      const priority = data.priority || 'MEDIUM';
      const now = new Date();
      const closureDate = computeClosureDate(priority, now);

      try {
        const [inserted] = await db
          .insert(schema.serviceRequests)
          .values({
            request_id: requestId,
            client_id: data.client_id,
            sr_type: data.sr_type as any,
            sr_details: data.sr_details || null,
            priority: priority as any,
            sr_status: 'APPROVED',
            request_date: now,
            closure_date: closureDate,
            remarks: data.remarks || null,
            documents: data.documents || [],
            assigned_rm_id: resolvedRmId,
            created_by: data.created_by,
            updated_by: data.created_by,
            created_at: now,
            updated_at: now,
          })
          .returning();

        // Insert creation history
        await insertStatusHistory(inserted.id, null, 'APPROVED', 'CREATED', data.created_by);

        result = inserted;
        break;
      } catch (err: any) {
        // Retry on unique constraint violation (concurrent insert)
        if (err.code === '23505' && attempt < 2) continue;
        throw err;
      }
    }

    return result;
  },

  /** Paginated list with DB-level filtering */
  async getServiceRequests(filters: {
    client_id?: string;
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    // Build dynamic WHERE conditions
    const conditions: any[] = [eq(schema.serviceRequests.is_deleted, false)];

    if (filters.client_id) {
      conditions.push(eq(schema.serviceRequests.client_id, filters.client_id));
    }
    if (filters.status) {
      conditions.push(eq(schema.serviceRequests.sr_status, filters.status as any));
    }
    if (filters.priority) {
      conditions.push(eq(schema.serviceRequests.priority, filters.priority as any));
    }
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(schema.serviceRequests.request_id, searchPattern),
          ilike(schema.serviceRequests.sr_type, searchPattern),
          ilike(schema.serviceRequests.sr_details, searchPattern),
        ),
      );
    }

    const whereClause = and(...conditions);
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 25, 100);

    // Get total count at DB level
    const countResult = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.serviceRequests)
      .where(whereClause);
    const total = Number(countResult[0]?.total ?? 0);

    // Get paginated data at DB level
    const rows = await db
      .select()
      .from(schema.serviceRequests)
      .where(whereClause)
      .orderBy(desc(schema.serviceRequests.created_at))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Compute request_age for returned page only
    const now = new Date();
    const data = rows.map((r: typeof rows[number]) => {
      const created = new Date(r.request_date);
      const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      return { ...r, request_age: ageDays };
    });

    return { data, total, page, pageSize };
  },

  /** Get by DB id */
  async getServiceRequestById(id: number) {
    const [sr] = await db
      .select()
      .from(schema.serviceRequests)
      .where(and(eq(schema.serviceRequests.id, id), eq(schema.serviceRequests.is_deleted, false)));
    if (!sr) return null;
    const now = new Date();
    const ageDays = Math.floor((now.getTime() - new Date(sr.request_date).getTime()) / (1000 * 60 * 60 * 24));
    return { ...sr, request_age: ageDays };
  },

  /** Get by human-readable request_id (e.g. SR-2026-000001) */
  async getServiceRequestByRequestId(requestId: string) {
    const [sr] = await db
      .select()
      .from(schema.serviceRequests)
      .where(and(eq(schema.serviceRequests.request_id, requestId), eq(schema.serviceRequests.is_deleted, false)));
    if (!sr) return null;
    const now = new Date();
    const ageDays = Math.floor((now.getTime() - new Date(sr.request_date).getTime()) / (1000 * 60 * 60 * 24));
    return { ...sr, request_age: ageDays };
  },

  /** Update editable fields (guards against editing terminal statuses) */
  async updateServiceRequest(id: number, updates: {
    sr_details?: string;
    remarks?: string;
    documents?: string[];
    closure_date?: string;
  }, userId: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (['COMPLETED', 'REJECTED', 'CLOSED'].includes(sr.sr_status ?? '')) {
      throw new Error(`Cannot modify service request in status ${sr.sr_status}`);
    }

    const setValues: Record<string, any> = { updated_at: new Date(), updated_by: userId };
    if (updates.sr_details !== undefined) setValues.sr_details = updates.sr_details;
    if (updates.remarks !== undefined) setValues.remarks = updates.remarks;
    if (updates.documents !== undefined) setValues.documents = updates.documents;
    if (updates.closure_date !== undefined) setValues.closure_date = new Date(updates.closure_date);

    await db.update(schema.serviceRequests).set(setValues).where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, sr.sr_status, sr.sr_status!, 'UPDATED', userId);

    return this.getServiceRequestById(id);
  },

  /** Close request (from APPROVED / READY_FOR_TELLER / INCOMPLETE) */
  async closeRequest(id: number, reason: string, userId: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (!['APPROVED', 'READY_FOR_TELLER', 'INCOMPLETE'].includes(sr.sr_status ?? '')) {
      throw new Error(`Cannot close from status ${sr.sr_status}`);
    }

    const fromStatus = sr.sr_status;
    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        sr_status: 'CLOSED',
        closure_reason: reason,
        actual_closure_date: now,
        updated_at: now,
        updated_by: userId,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, fromStatus, 'CLOSED', 'CLOSED', userId, reason);

    return this.getServiceRequestById(id);
  },

  /** RM sends for teller verification (APPROVED → READY_FOR_TELLER) */
  async sendForVerification(id: number, data: {
    service_branch?: string;
    resolution_unit?: string;
    sales_date?: string;
    assigned_rm_id?: number;
  }, userId: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (sr.sr_status !== 'APPROVED') {
      throw new Error(`Cannot send for verification from status ${sr.sr_status}, expected APPROVED`);
    }

    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        sr_status: 'READY_FOR_TELLER',
        service_branch: data.service_branch || sr.service_branch,
        resolution_unit: data.resolution_unit || sr.resolution_unit,
        sales_date: data.sales_date ? new Date(data.sales_date) : sr.sales_date,
        assigned_rm_id: data.assigned_rm_id ?? sr.assigned_rm_id,
        updated_at: now,
        updated_by: userId,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, 'APPROVED', 'READY_FOR_TELLER', 'STATUS_CHANGE', userId);

    return this.getServiceRequestById(id);
  },

  /** Teller completes the request (READY_FOR_TELLER → COMPLETED) */
  async completeRequest(id: number, tellerId: number, userId: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (sr.sr_status !== 'READY_FOR_TELLER') {
      throw new Error(`Cannot complete from status ${sr.sr_status}, expected READY_FOR_TELLER`);
    }

    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        sr_status: 'COMPLETED',
        teller_id: tellerId,
        actual_closure_date: now,
        updated_at: now,
        updated_by: userId,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, 'READY_FOR_TELLER', 'COMPLETED', 'STATUS_CHANGE', userId);

    // SR G-005: Notify the assigned RM when SR is completed
    if (sr.assigned_rm_id) {
      await notificationInboxService.notify({
        recipient_user_id: sr.assigned_rm_id,
        type: 'SERVICE_REQUEST_COMPLETED',
        title: 'Service Request Completed',
        message: `Service request ${sr.request_id} has been successfully completed by the teller.`,
        channel: 'IN_APP',
        related_entity_type: 'service_request',
        related_entity_id: id,
      });
    }

    return this.getServiceRequestById(id);
  },

  /** Teller marks incomplete (READY_FOR_TELLER → INCOMPLETE) */
  async markIncomplete(id: number, tellerId: number, notes: string, userId: string) {
    // SR G-015: verification notes must be at least 10 characters
    if (!notes || notes.trim().length < 10) {
      throw new Error('Verification notes must be at least 10 characters');
    }
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (sr.sr_status !== 'READY_FOR_TELLER') {
      throw new Error(`Cannot mark incomplete from status ${sr.sr_status}, expected READY_FOR_TELLER`);
    }

    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        sr_status: 'INCOMPLETE',
        teller_id: tellerId,
        verification_notes: notes,
        updated_at: now,
        updated_by: userId,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, 'READY_FOR_TELLER', 'INCOMPLETE', 'STATUS_CHANGE', userId, notes);

    // SR G-005: Notify the assigned RM when SR is marked incomplete
    if (sr.assigned_rm_id) {
      await notificationInboxService.notify({
        recipient_user_id: sr.assigned_rm_id,
        type: 'SERVICE_REQUEST_INCOMPLETE',
        title: 'Service Request Needs Attention',
        message: `Service request ${sr.request_id} has been marked incomplete by the teller. Notes: ${notes}`,
        channel: 'IN_APP',
        related_entity_type: 'service_request',
        related_entity_id: id,
      });
    }

    return this.getServiceRequestById(id);
  },

  /** Re-submit for verification (INCOMPLETE → READY_FOR_TELLER) */
  async resubmitForVerification(id: number, data: {
    remarks?: string;
    documents?: string[];
  }, userId: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (sr.sr_status !== 'INCOMPLETE') {
      throw new Error(`Cannot resubmit from status ${sr.sr_status}, expected INCOMPLETE`);
    }

    const now = new Date();
    const setValues: Record<string, any> = {
      sr_status: 'READY_FOR_TELLER',
      updated_at: now,
      updated_by: userId,
    };
    if (data.remarks !== undefined) setValues.remarks = data.remarks;
    if (data.documents !== undefined) setValues.documents = data.documents;

    await db.update(schema.serviceRequests).set(setValues).where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, 'INCOMPLETE', 'READY_FOR_TELLER', 'STATUS_CHANGE', userId);

    return this.getServiceRequestById(id);
  },

  /** Reject (READY_FOR_TELLER → REJECTED) */
  async rejectRequest(id: number, reason: string, userId: string) {
    // SR G-016: rejection reason must be at least 10 characters
    if (!reason || reason.trim().length < 10) {
      throw new Error('Rejection reason must be at least 10 characters');
    }
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (sr.sr_status !== 'READY_FOR_TELLER') {
      throw new Error(`Cannot reject from status ${sr.sr_status}, expected READY_FOR_TELLER`);
    }

    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        sr_status: 'REJECTED',
        rejection_reason: reason,
        actual_closure_date: now,
        updated_at: now,
        updated_by: userId,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(id, 'READY_FOR_TELLER', 'REJECTED', 'STATUS_CHANGE', userId, reason);

    // SR G-005: Notify the assigned RM when SR is rejected
    if (sr.assigned_rm_id) {
      await notificationInboxService.notify({
        recipient_user_id: sr.assigned_rm_id,
        type: 'SERVICE_REQUEST_REJECTED',
        title: 'Service Request Rejected',
        message: `Service request ${sr.request_id} has been rejected. Reason: ${reason}`,
        channel: 'IN_APP',
        related_entity_type: 'service_request',
        related_entity_id: id,
      });
    }

    return this.getServiceRequestById(id);
  },

  /** Reassign RM (non-terminal statuses only) */
  async reassignRM(id: number, newRmId: number, changedBy: string) {
    const sr = await this.getServiceRequestById(id);
    if (!sr) throw new Error(`Service request ${id} not found`);
    if (['COMPLETED', 'REJECTED', 'CLOSED'].includes(sr.sr_status ?? '')) {
      throw new Error(`Cannot reassign RM for service request in terminal status ${sr.sr_status}`);
    }

    const now = new Date();
    await db
      .update(schema.serviceRequests)
      .set({
        assigned_rm_id: newRmId,
        updated_at: now,
        updated_by: changedBy,
      })
      .where(eq(schema.serviceRequests.id, id));

    await insertStatusHistory(
      id, sr.sr_status, sr.sr_status!, 'REASSIGNED', changedBy,
      `RM reassigned from ${sr.assigned_rm_id ?? 'none'} to ${newRmId}`,
    );

    return this.getServiceRequestById(id);
  },

  /** Count INCOMPLETE SRs for a client (notification badge) */
  async getActionCount(clientId: string) {
    const result = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.serviceRequests)
      .where(
        and(
          eq(schema.serviceRequests.client_id, clientId),
          eq(schema.serviceRequests.sr_status, 'INCOMPLETE'),
          eq(schema.serviceRequests.is_deleted, false),
        ),
      );
    return { count: Number(result[0]?.total ?? 0) };
  },

  /** Get status history for a service request */
  async getStatusHistory(srId: number) {
    return db
      .select()
      .from(schema.srStatusHistory)
      .where(eq(schema.srStatusHistory.sr_id, srId))
      .orderBy(schema.srStatusHistory.changed_at);
  },

  /** KPI summary: counts by status/priority, overdue SLA count */
  async getSummary() {
    const all = await db
      .select()
      .from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.is_deleted, false));

    type SRRow = typeof all[number];
    const byStatus = {
      new: all.filter((r: SRRow) => r.sr_status === 'NEW').length,
      approved: all.filter((r: SRRow) => r.sr_status === 'APPROVED').length,
      readyForTeller: all.filter((r: SRRow) => r.sr_status === 'READY_FOR_TELLER').length,
      completed: all.filter((r: SRRow) => r.sr_status === 'COMPLETED').length,
      incomplete: all.filter((r: SRRow) => r.sr_status === 'INCOMPLETE').length,
      rejected: all.filter((r: SRRow) => r.sr_status === 'REJECTED').length,
      closed: all.filter((r: SRRow) => r.sr_status === 'CLOSED').length,
    };

    const now = new Date();
    const openStatuses = ['NEW', 'APPROVED', 'READY_FOR_TELLER', 'INCOMPLETE'];
    const overdueSla = all.filter((r: SRRow) => {
      if (!openStatuses.includes(r.sr_status ?? '')) return false;
      if (!r.closure_date) return false;
      return now > new Date(r.closure_date);
    }).length;

    return { byStatus, overdueSla, total: all.length };
  },
};
