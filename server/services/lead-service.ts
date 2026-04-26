/**
 * Lead Management Service (CRM Phase 2)
 *
 * Handles lead CRUD, status lifecycle state machine, sub-entity management,
 * RM ownership filtering, field locking, age validation, and dashboard KPIs.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, count, inArray, gte, lte, isNull, or } from 'drizzle-orm';
import crypto from 'crypto';
import { DEFAULT_CURRENCY } from '../constants/crm';
import { negativeListService } from './negative-list-service';

// ============================================================================
// Inferred Row Types
// ============================================================================

type Lead = typeof schema.leads.$inferSelect;
type LeadFamilyMember = typeof schema.leadFamilyMembers.$inferSelect;
type LeadAddress = typeof schema.leadAddresses.$inferSelect;
type LeadIdentification = typeof schema.leadIdentifications.$inferSelect;
type LeadLifestyle = typeof schema.leadLifestyle.$inferSelect;
type LeadDocument = typeof schema.leadDocuments.$inferSelect;

// ============================================================================
// Types & Constants
// ============================================================================

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLIENT_ACCEPTED' | 'CONVERTED' | 'NOT_INTERESTED' | 'DO_NOT_CONTACT' | 'DROPPED';

/** Typed input for lead create/update operations */
interface LeadData {
  entity_type?: string;
  salutation?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  short_name?: string;
  entity_name?: string;
  company_name?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  country_of_residence?: string;
  marital_status?: string;
  occupation?: string;
  industry?: string;
  email?: string;
  mobile_phone?: string;
  country_code?: string;
  primary_contact_no?: string;
  fixed_line_no?: string;
  source?: string;
  source_campaign_id?: number;
  assigned_rm_id?: number;
  client_category?: string;
  total_aum?: string;
  gross_monthly_income?: string;
  estimated_aum?: string;
  aum_currency?: string;
  trv?: string;
  trv_currency?: string;
  risk_profile?: string;
  risk_appetite?: string;
  classification?: string;
  politically_exposed?: boolean;
  product_interest?: unknown;
  notes?: string;
  referral_type?: string;
  referral_id?: string;
  branch_id?: number;
  [key: string]: unknown;
}

const TERMINAL_STATUSES: LeadStatus[] = ['CONVERTED', 'DO_NOT_CONTACT'];

/**
 * Lead status transition map.
 * Key = current status, Value = set of allowed next statuses.
 *
 * NEW -> CONTACTED -> QUALIFIED -> CLIENT_ACCEPTED -> CONVERTED (via conversion only)
 * NEW/CONTACTED/QUALIFIED -> NOT_INTERESTED
 * any -> DO_NOT_CONTACT (terminal)
 * any non-terminal -> DROPPED (with mandatory drop_reason)
 */
const TRANSITION_MAP: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED'],
  CONTACTED: ['QUALIFIED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED'],
  QUALIFIED: ['CLIENT_ACCEPTED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'DROPPED'],
  CLIENT_ACCEPTED: ['CONVERTED', 'DO_NOT_CONTACT', 'DROPPED'],
  CONVERTED: ['DO_NOT_CONTACT'],
  NOT_INTERESTED: ['CONTACTED', 'DO_NOT_CONTACT', 'DROPPED'],
  DO_NOT_CONTACT: [], // terminal — no transitions out
  DROPPED: ['DO_NOT_CONTACT'],
};

const PAGE_SIZE = 20;

// ============================================================================
// Helpers
// ============================================================================

function generateLeadNumber(): string {
  const digits = String(crypto.randomInt(100_000_000)).padStart(8, '0');
  return `L-${digits}`;
}

function computeDedupHash(firstName: string, lastName: string, email?: string, phone?: string): string {
  const normalized = [
    (firstName || '').toLowerCase().trim(),
    (lastName || '').toLowerCase().trim(),
    (email || '').toLowerCase().trim(),
    (phone || '').replace(/[\s\-\+]/g, ''),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function validateAge(dateOfBirth: string | null | undefined): void {
  if (!dateOfBirth) return;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 18) {
    throw new Error('Individual leads must be at least 18 years old');
  }
}

// ============================================================================
// Lead Service
// ============================================================================

export const leadService = {
  // --------------------------------------------------------------------------
  // Status Validation
  // --------------------------------------------------------------------------

  validateTransition(currentStatus: string, newStatus: string): boolean {
    const allowed = TRANSITION_MAP[currentStatus as LeadStatus];
    if (!allowed) return false;
    return allowed.includes(newStatus as LeadStatus);
  },

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async create(data: LeadData, userId: string): Promise<Lead> {
    // Age validation for individuals
    if ((!data.entity_type || data.entity_type === 'INDIVIDUAL') && data.date_of_birth) {
      validateAge(String(data.date_of_birth));
    }

    // BRD G-32: email format validation
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(data.email))) {
        throw new Error('Invalid email format');
      }
    }
    // BRD G-32: phone length validation (7–15 digits per E.164)
    if (data.mobile_phone) {
      const digits = String(data.mobile_phone).replace(/[\s\-\+\(\)]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        throw new Error('mobile_phone must be 7–15 digits');
      }
    }

    // Negative list screening — hard stop on any match
    const screenResult = await negativeListService.screenEntity({
      first_name: data.first_name ? String(data.first_name) : undefined,
      last_name: data.last_name ? String(data.last_name) : undefined,
      entity_name: data.entity_name ? String(data.entity_name) : undefined,
      email: data.email ? String(data.email) : undefined,
      mobile_phone: data.mobile_phone ? String(data.mobile_phone) : undefined,
    });
    // BRD G-03: audit all screening attempts
    await db.insert(schema.auditRecords).values({
      entity_type: 'lead',
      entity_id: 'PRE_CREATE',
      action: 'UPDATE',
      actor_id: userId,
      changes: {
        event: 'NEGATIVE_LIST_SCREEN',
        matched: screenResult.matched,
        match_count: screenResult.matches.length,
        list_types: screenResult.matches.map((m: { list_type: string }) => m.list_type),
      },
    } as any);
    if (screenResult.matched) {
      throw new Error(`Lead creation blocked: entity matched negative list (${screenResult.matches.map((m: { list_type: string }) => m.list_type).join(', ')})`);
    }

    const lead_code = generateLeadNumber();
    const dedup_hash = computeDedupHash(
      String(data.first_name || ''),
      String(data.last_name || ''),
      data.email ? String(data.email) : undefined,
      data.mobile_phone ? String(data.mobile_phone) : undefined,
    );

    const [lead] = await db
      .insert(schema.leads)
      .values({
        lead_code,
        entity_type: (data.entity_type as 'INDIVIDUAL' | 'NON_INDIVIDUAL') || 'INDIVIDUAL',
        salutation: data.salutation ? String(data.salutation) : null,
        first_name: String(data.first_name),
        middle_name: data.middle_name ? String(data.middle_name) : null,
        last_name: String(data.last_name),
        short_name: data.short_name ? String(data.short_name) : null,
        entity_name: data.entity_name ? String(data.entity_name) : null,
        company_name: data.company_name ? String(data.company_name) : null,
        date_of_birth: data.date_of_birth ? String(data.date_of_birth) : null,
        gender: data.gender ? String(data.gender) : null,
        nationality: data.nationality ? String(data.nationality) : null,
        country_of_residence: data.country_of_residence ? String(data.country_of_residence) : null,
        marital_status: data.marital_status ? String(data.marital_status) : null,
        occupation: data.occupation ? String(data.occupation) : null,
        industry: data.industry ? String(data.industry) : null,
        email: data.email ? String(data.email) : null,
        mobile_phone: data.mobile_phone ? String(data.mobile_phone) : null,
        country_code: data.country_code ? String(data.country_code) : null,
        primary_contact_no: data.primary_contact_no ? String(data.primary_contact_no) : null,
        fixed_line_no: data.fixed_line_no ? String(data.fixed_line_no) : null,
        source: (data.source as any) || 'MANUAL',
        source_campaign_id: data.source_campaign_id ? Number(data.source_campaign_id) : null,
        lead_status: 'NEW',
        assigned_rm_id: data.assigned_rm_id ? Number(data.assigned_rm_id) : null,
        client_category: data.client_category ? String(data.client_category) : null,
        total_aum: data.total_aum ? String(data.total_aum) : null,
        gross_monthly_income: data.gross_monthly_income ? String(data.gross_monthly_income) : null,
        estimated_aum: data.estimated_aum ? String(data.estimated_aum) : null,
        aum_currency: data.aum_currency ? String(data.aum_currency) : DEFAULT_CURRENCY,
        trv: data.trv ? String(data.trv) : null,
        trv_currency: data.trv_currency ? String(data.trv_currency) : DEFAULT_CURRENCY,
        risk_profile: data.risk_profile ? (data.risk_profile as any) : null,
        risk_appetite: data.risk_appetite ? String(data.risk_appetite) : null,
        classification: data.classification ? String(data.classification) : null,
        politically_exposed: data.politically_exposed ? Boolean(data.politically_exposed) : false,
        product_interest: data.product_interest || '[]',
        notes: data.notes ? String(data.notes) : null,
        dedup_hash,
        // G-033: Business Registration Number for Non-Individual entity types
        business_registration_number: (data as Record<string, unknown>).business_registration_number
          ? String((data as Record<string, unknown>).business_registration_number)
          : null,
        referral_type: data.referral_type ? String(data.referral_type) : null,
        referral_id: data.referral_id ? String(data.referral_id) : null,
        branch_id: data.branch_id ? Number(data.branch_id) : null,
        // G-028: auto-capture PDPA/marketing consent at creation time
        marketing_consent: Boolean((data as Record<string, unknown>).marketing_consent ?? true),
        marketing_consent_date: new Date(),
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    // G-028: audit the consent capture event
    await db.insert(schema.auditRecords).values({
      entity_type: 'lead',
      entity_id: String(lead.id),
      action: 'CONSENT_CAPTURED',
      actor_id: userId,
      changes: { marketing_consent: true, captured_at: new Date().toISOString() },
    } as any);

    return lead;
  },

  async getById(id: number): Promise<Lead & { familyMembers: LeadFamilyMember[]; addresses: LeadAddress[]; identifications: LeadIdentification[]; lifestyle: LeadLifestyle[]; documents: LeadDocument[] }> {
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, id), eq(schema.leads.is_deleted, false)));
    if (!lead) throw new Error('Lead not found');

    // Fetch sub-entities
    const familyMembers = await db
      .select()
      .from(schema.leadFamilyMembers)
      .where(and(eq(schema.leadFamilyMembers.lead_id, id), eq(schema.leadFamilyMembers.is_deleted, false)));

    const addresses = await db
      .select()
      .from(schema.leadAddresses)
      .where(and(eq(schema.leadAddresses.lead_id, id), eq(schema.leadAddresses.is_deleted, false)));

    const identifications = await db
      .select()
      .from(schema.leadIdentifications)
      .where(and(eq(schema.leadIdentifications.lead_id, id), eq(schema.leadIdentifications.is_deleted, false)));

    const lifestyle = await db
      .select()
      .from(schema.leadLifestyle)
      .where(and(eq(schema.leadLifestyle.lead_id, id), eq(schema.leadLifestyle.is_deleted, false)));

    const documents = await db
      .select()
      .from(schema.leadDocuments)
      .where(and(eq(schema.leadDocuments.lead_id, id), eq(schema.leadDocuments.is_deleted, false)));

    return { ...lead, familyMembers, addresses, identifications, lifestyle, documents };
  },

  async update(id: number, data: LeadData, userId: string): Promise<Lead> {
    const [existing] = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, id), eq(schema.leads.is_deleted, false)));
    if (!existing) throw new Error('Lead not found');

    // Field locking when CONVERTED — only notes editable
    if (existing.lead_status === 'CONVERTED') {
      const allowedKeys = ['notes'];
      const attemptedKeys = Object.keys(data).filter((k) => !allowedKeys.includes(k));
      if (attemptedKeys.length > 0) {
        throw new Error(`Lead is CONVERTED. Only the following fields may be edited: ${allowedKeys.join(', ')}`);
      }
    }

    // Age validation for individuals
    if ((!existing.entity_type || existing.entity_type === 'INDIVIDUAL') && data.date_of_birth) {
      validateAge(String(data.date_of_birth));
    }

    // Rebuild dedup hash if name/email/phone changed
    const firstName = data.first_name ? String(data.first_name) : existing.first_name;
    const lastName = data.last_name ? String(data.last_name) : existing.last_name;
    const email = data.email !== undefined ? (data.email ? String(data.email) : '') : (existing.email || '');
    const phone = data.mobile_phone !== undefined ? (data.mobile_phone ? String(data.mobile_phone) : '') : (existing.mobile_phone || '');
    const dedup_hash = computeDedupHash(firstName, lastName, email, phone);

    const updatePayload: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date(),
      dedup_hash,
    };

    // Copy over allowed fields
    const editableFields = [
      'salutation', 'first_name', 'middle_name', 'last_name', 'short_name',
      'entity_name', 'company_name', 'date_of_birth', 'gender', 'nationality',
      'country_of_residence', 'marital_status', 'occupation', 'industry',
      'email', 'mobile_phone', 'country_code', 'primary_contact_no', 'fixed_line_no',
      'source', 'source_campaign_id', 'assigned_rm_id', 'client_category',
      'total_aum', 'gross_monthly_income', 'estimated_aum', 'aum_currency',
      'trv', 'trv_currency', 'risk_profile', 'risk_appetite', 'classification',
      'politically_exposed', 'product_interest', 'notes', 'referral_type',
      'referral_id', 'branch_id',
    ];

    for (const key of editableFields) {
      if (data[key] !== undefined) {
        updatePayload[key] = data[key];
      }
    }

    const [updated] = await db
      .update(schema.leads)
      .set(updatePayload as any)
      .where(eq(schema.leads.id, id))
      .returning();

    // LP G-05: Field-level audit record on update
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(updatePayload)) {
      if (key !== 'updated_by' && key !== 'updated_at' && key !== 'dedup_hash') {
        const oldVal = (existing as Record<string, unknown>)[key];
        const newVal = updatePayload[key as keyof typeof updatePayload];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields[key] = { from: oldVal, to: newVal };
        }
      }
    }
    if (Object.keys(changedFields).length > 0) {
      await db.insert(schema.auditRecords).values({
        entity_type: 'lead',
        entity_id: String(id),
        action: 'UPDATE',
        actor_id: userId,
        changes: changedFields,
      } as any);
    }

    return updated;
  },

  async list(filters: {
    statuses?: string[];
    aum_min?: number;
    aum_max?: number;
    date_from?: string;
    date_to?: string;
    assigned_rm_id?: number;
    branch_id?: number;
    search?: string;
    page?: number;
    userRole?: string;
    userId?: string;
    userBranchId?: number;
  }): Promise<{ data: Lead[]; pagination: { page: number; page_size: number; total: number; total_pages: number } }> {
    const page = filters.page || 1;
    const offset = (page - 1) * PAGE_SIZE;

    const conditions: ReturnType<typeof eq>[] = [eq(schema.leads.is_deleted, false)];

    // RM ownership filtering
    if (filters.userRole === 'RELATIONSHIP_MANAGER' && filters.userId) {
      conditions.push(eq(schema.leads.assigned_rm_id, Number(filters.userId)));
    } else if (filters.userRole === 'SENIOR_RM' && filters.userBranchId) {
      conditions.push(eq(schema.leads.branch_id, filters.userBranchId));
    }
    // BranchMgr / BO roles see all — no extra filter

    // Status filter
    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(schema.leads.lead_status, filters.statuses as any));
    }

    // AUM range
    if (filters.aum_min !== undefined) {
      conditions.push(gte(sql`CAST(${schema.leads.total_aum} AS numeric)`, filters.aum_min));
    }
    if (filters.aum_max !== undefined) {
      conditions.push(lte(sql`CAST(${schema.leads.total_aum} AS numeric)`, filters.aum_max));
    }

    // Date range (created_at)
    if (filters.date_from) {
      conditions.push(gte(schema.leads.created_at, new Date(filters.date_from)));
    }
    if (filters.date_to) {
      conditions.push(lte(schema.leads.created_at, new Date(filters.date_to)));
    }

    // Specific RM filter (from query)
    if (filters.assigned_rm_id) {
      conditions.push(eq(schema.leads.assigned_rm_id, filters.assigned_rm_id));
    }

    // Branch filter
    if (filters.branch_id) {
      conditions.push(eq(schema.leads.branch_id, filters.branch_id));
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.leads)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(schema.leads)
      .where(and(...conditions))
      .orderBy(desc(schema.leads.created_at))
      .limit(PAGE_SIZE)
      .offset(offset);

    return {
      data: rows,
      pagination: {
        page,
        page_size: PAGE_SIZE,
        total: Number(totalResult.count),
        total_pages: Math.ceil(Number(totalResult.count) / PAGE_SIZE),
      },
    };
  },

  // --------------------------------------------------------------------------
  // Status Lifecycle
  // --------------------------------------------------------------------------

  async updateStatus(id: number, newStatus: string, userId: string, dropReason?: string): Promise<Lead> {
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, id), eq(schema.leads.is_deleted, false)));
    if (!lead) throw new Error('Lead not found');

    if (!this.validateTransition(lead.lead_status, newStatus)) {
      throw new Error(
        `Invalid status transition: ${lead.lead_status} -> ${newStatus}`,
      );
    }

    // DROPPED and NOT_INTERESTED require mandatory drop_reason (min 10 chars per BRD)
    if (newStatus === 'DROPPED') {
      if (!dropReason || dropReason.trim().length < 10) {
        throw new Error('drop_reason is mandatory when dropping a lead and must be at least 10 characters');
      }
    }
    if (newStatus === 'NOT_INTERESTED') {
      if (!dropReason || dropReason.trim().length < 10) {
        throw new Error('drop_reason is mandatory when setting status to NOT_INTERESTED and must be at least 10 characters');
      }
    }

    // CONVERTED can only happen through conversion-service, not direct status update
    if (newStatus === 'CONVERTED') {
      throw new Error('Leads cannot be set to CONVERTED directly. Use the conversion endpoint.');
    }

    const updatePayload: Record<string, unknown> = {
      lead_status: newStatus,
      updated_by: userId,
      updated_at: new Date(),
    };

    if ((newStatus === 'DROPPED' || newStatus === 'NOT_INTERESTED') && dropReason) {
      updatePayload.drop_reason = dropReason;
    }

    const [updated] = await db
      .update(schema.leads)
      .set(updatePayload as any)
      .where(eq(schema.leads.id, id))
      .returning();

    // BRD G-04: audit status change
    await db.insert(schema.auditRecords).values({
      entity_type: 'lead',
      entity_id: String(id),
      action: 'UPDATE',
      actor_id: userId,
      changes: { status: { from: lead.lead_status, to: newStatus }, drop_reason: dropReason ?? null },
    } as any);

    return updated;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Family Members
  // --------------------------------------------------------------------------

  async addFamilyMember(leadId: number, data: Record<string, unknown>, userId: string): Promise<LeadFamilyMember> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    if (lead.lead_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED lead');

    const [member] = await db
      .insert(schema.leadFamilyMembers)
      .values({
        lead_id: leadId,
        relationship: String(data.relationship),
        first_name: String(data.first_name),
        last_name: String(data.last_name),
        date_of_birth: data.date_of_birth ? String(data.date_of_birth) : null,
        occupation: data.occupation ? String(data.occupation) : null,
        contact_number: data.contact_number ? String(data.contact_number) : null,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return member;
  },

  async updateFamilyMember(memberId: number, data: Record<string, unknown>, userId: string): Promise<LeadFamilyMember> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['relationship', 'first_name', 'last_name', 'date_of_birth', 'occupation', 'contact_number']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.leadFamilyMembers)
      .set(updatePayload as any)
      .where(eq(schema.leadFamilyMembers.id, memberId))
      .returning();
    if (!updated) throw new Error('Family member not found');
    return updated;
  },

  async removeFamilyMember(memberId: number, userId: string): Promise<LeadFamilyMember> {
    const [removed] = await db
      .update(schema.leadFamilyMembers)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadFamilyMembers.id, memberId))
      .returning();
    if (!removed) throw new Error('Family member not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Addresses
  // --------------------------------------------------------------------------

  async addAddress(leadId: number, data: Record<string, unknown>, userId: string): Promise<LeadAddress> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    if (lead.lead_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED lead');

    const [address] = await db
      .insert(schema.leadAddresses)
      .values({
        lead_id: leadId,
        address_type: String(data.address_type),
        address_line_1: String(data.address_line_1),
        address_line_2: data.address_line_2 ? String(data.address_line_2) : null,
        city: String(data.city),
        state_province: data.state_province ? String(data.state_province) : null,
        postal_code: data.postal_code ? String(data.postal_code) : null,
        country: String(data.country),
        is_primary: data.is_primary ? Boolean(data.is_primary) : false,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return address;
  },

  async updateAddress(addressId: number, data: Record<string, unknown>, userId: string): Promise<LeadAddress> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['address_type', 'address_line_1', 'address_line_2', 'city', 'state_province', 'postal_code', 'country', 'is_primary']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.leadAddresses)
      .set(updatePayload as any)
      .where(eq(schema.leadAddresses.id, addressId))
      .returning();
    if (!updated) throw new Error('Address not found');
    return updated;
  },

  async removeAddress(addressId: number, userId: string): Promise<LeadAddress> {
    const [removed] = await db
      .update(schema.leadAddresses)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadAddresses.id, addressId))
      .returning();
    if (!removed) throw new Error('Address not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Identifications
  // --------------------------------------------------------------------------

  async addIdentification(leadId: number, data: Record<string, unknown>, userId: string): Promise<LeadIdentification> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    if (lead.lead_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED lead');

    const [identification] = await db
      .insert(schema.leadIdentifications)
      .values({
        lead_id: leadId,
        id_type: String(data.id_type),
        id_number: String(data.id_number),
        issue_date: data.issue_date ? String(data.issue_date) : null,
        expiry_date: data.expiry_date ? String(data.expiry_date) : null,
        issuing_authority: data.issuing_authority ? String(data.issuing_authority) : null,
        issuing_country: data.issuing_country ? String(data.issuing_country) : null,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return identification;
  },

  async updateIdentification(identificationId: number, data: Record<string, unknown>, userId: string): Promise<LeadIdentification> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['id_type', 'id_number', 'issue_date', 'expiry_date', 'issuing_authority', 'issuing_country']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.leadIdentifications)
      .set(updatePayload as any)
      .where(eq(schema.leadIdentifications.id, identificationId))
      .returning();
    if (!updated) throw new Error('Identification not found');
    return updated;
  },

  async removeIdentification(identificationId: number, userId: string): Promise<LeadIdentification> {
    const [removed] = await db
      .update(schema.leadIdentifications)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadIdentifications.id, identificationId))
      .returning();
    if (!removed) throw new Error('Identification not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Lifestyle
  // --------------------------------------------------------------------------

  async addLifestyle(leadId: number, data: Record<string, unknown>, userId: string): Promise<LeadLifestyle> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    if (lead.lead_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED lead');

    const [lifestyle] = await db
      .insert(schema.leadLifestyle)
      .values({
        lead_id: leadId,
        hobbies: data.hobbies || '[]',
        cuisine_preferences: data.cuisine_preferences || '[]',
        sports: data.sports || '[]',
        clubs_memberships: data.clubs_memberships || '[]',
        special_dates: data.special_dates || '[]',
        communication_preference: data.communication_preference ? String(data.communication_preference) : null,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return lifestyle;
  },

  async updateLifestyle(lifestyleId: number, data: Record<string, unknown>, userId: string): Promise<LeadLifestyle> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['hobbies', 'cuisine_preferences', 'sports', 'clubs_memberships', 'special_dates', 'communication_preference']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.leadLifestyle)
      .set(updatePayload as any)
      .where(eq(schema.leadLifestyle.id, lifestyleId))
      .returning();
    if (!updated) throw new Error('Lifestyle record not found');
    return updated;
  },

  async removeLifestyle(lifestyleId: number, userId: string): Promise<LeadLifestyle> {
    const [removed] = await db
      .update(schema.leadLifestyle)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadLifestyle.id, lifestyleId))
      .returning();
    if (!removed) throw new Error('Lifestyle record not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Documents
  // --------------------------------------------------------------------------

  async addDocument(leadId: number, data: Record<string, unknown>, userId: string): Promise<LeadDocument> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    if (!lead) throw new Error('Lead not found');
    if (lead.lead_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED lead');

    const [document] = await db
      .insert(schema.leadDocuments)
      .values({
        lead_id: leadId,
        document_type: String(data.document_type),
        file_name: String(data.file_name),
        file_url: String(data.file_url),
        file_size: data.file_size ? Number(data.file_size) : null,
        mime_type: data.mime_type ? String(data.mime_type) : null,
        created_by: userId,
        updated_by: userId,
      })
      .returning();

    return document;
  },

  async updateDocument(documentId: number, data: Record<string, unknown>, userId: string): Promise<LeadDocument> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['document_type', 'file_name', 'file_url', 'file_size', 'mime_type']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.leadDocuments)
      .set(updatePayload as any)
      .where(eq(schema.leadDocuments.id, documentId))
      .returning();
    if (!updated) throw new Error('Document not found');
    return updated;
  },

  async removeDocument(documentId: number, userId: string): Promise<LeadDocument> {
    const [removed] = await db
      .update(schema.leadDocuments)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.leadDocuments.id, documentId))
      .returning();
    if (!removed) throw new Error('Document not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Dashboard KPIs
  // --------------------------------------------------------------------------

  async getDashboardData(userId: string, userRole: string, userBranchId?: number): Promise<{
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    client_accepted: number;
    converted: number;
    not_interested: number;
    dropped: number;
    converted_this_month: number;
    ageing_buckets: { green: number; yellow: number; red: number };
    status_breakdown: { lead_status: string; count: number }[];
  }> {
    const conditions: ReturnType<typeof eq>[] = [eq(schema.leads.is_deleted, false)];

    // RM ownership scoping
    if (userRole === 'RELATIONSHIP_MANAGER') {
      conditions.push(eq(schema.leads.assigned_rm_id, Number(userId)));
    } else if (userRole === 'SENIOR_RM' && userBranchId) {
      conditions.push(eq(schema.leads.branch_id, userBranchId));
    }

    // Total leads
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.leads)
      .where(and(...conditions));

    // By status
    const statusCounts = await db
      .select({
        lead_status: schema.leads.lead_status,
        count: count(),
      })
      .from(schema.leads)
      .where(and(...conditions))
      .groupBy(schema.leads.lead_status);

    // Converted this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [convertedThisMonth] = await db
      .select({ count: count() })
      .from(schema.leads)
      .where(and(
        ...conditions,
        eq(schema.leads.lead_status, 'CONVERTED'),
        gte(schema.leads.conversion_date, firstOfMonth),
      ));

    // CM G-034: Ageing buckets — green < 30 days, yellow 30–90, red > 90
    const allLeads = await db
      .select({ id: schema.leads.id, created_at: schema.leads.created_at })
      .from(schema.leads)
      .where(and(...conditions));
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    const nowMs = Date.now();
    for (const l of allLeads) {
      const days = Math.floor((nowMs - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (days < 30) greenCount++;
      else if (days <= 90) yellowCount++;
      else redCount++;
    }

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.lead_status] = Number(row.count);
    }

    return {
      total: Number(totalResult.count),
      new: statusMap['NEW'] || 0,
      contacted: statusMap['CONTACTED'] || 0,
      qualified: statusMap['QUALIFIED'] || 0,
      client_accepted: statusMap['CLIENT_ACCEPTED'] || 0,
      converted: statusMap['CONVERTED'] || 0,
      not_interested: statusMap['NOT_INTERESTED'] || 0,
      dropped: statusMap['DROPPED'] || 0,
      converted_this_month: Number(convertedThisMonth?.count || 0),
      ageing_buckets: { green: greenCount, yellow: yellowCount, red: redCount },
      status_breakdown: statusCounts,
    };
  },
};
