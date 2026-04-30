/**
 * Prospect Management Service (CRM Phase 2)
 *
 * Handles prospect CRUD, status lifecycle, sub-entity management,
 * RM ownership filtering, classification tier logic, and ageing indicators.
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, desc, count, inArray, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { DEFAULT_CURRENCY } from '../constants/crm';
import { negativeListService } from './negative-list-service';

// ============================================================================
// Types & Constants
// ============================================================================

type Prospect = typeof schema.prospects.$inferSelect;
type ProspectFamilyMember = typeof schema.prospectFamilyMembers.$inferSelect;
type ProspectAddress = typeof schema.prospectAddresses.$inferSelect;
type ProspectIdentification = typeof schema.prospectIdentifications.$inferSelect;
type ProspectLifestyle = typeof schema.prospectLifestyle.$inferSelect;
type ProspectDocument = typeof schema.prospectDocuments.$inferSelect;

type ProspectStatus = 'ACTIVE' | 'DROPPED' | 'REACTIVATED' | 'RECOMMENDED' | 'RECOMMENDED_FOR_CLIENT' | 'CONVERTED';
const RECOMMENDED_PROSPECT_STATUS: ProspectStatus = 'RECOMMENDED_FOR_CLIENT';

/** Typed input for prospect create/update operations */
interface ProspectData {
  lead_id?: number;
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
  gross_monthly_income?: string;
  total_aum?: string;
  aum_currency?: string;
  trv?: string;
  trv_currency?: string;
  risk_profile?: string;
  product_interests?: unknown;
  assigned_rm_id?: number;
  source_campaign_id?: number;
  source_lead_id?: number;
  referral_type?: string;
  referral_id?: string;
  branch_id?: number;
  [key: string]: unknown;
}

/**
 * Prospect status transitions:
 * ACTIVE -> DROPPED (mandatory drop_reason, min 10 chars, sets drop_date)
 * DROPPED -> REACTIVATED (sets reactivation_date)
 * REACTIVATED -> RECOMMENDED_FOR_CLIENT | DROPPED
 * RECOMMENDED / RECOMMENDED_FOR_CLIENT -> CONVERTED
 * ACTIVE -> RECOMMENDED_FOR_CLIENT
 */
const TRANSITION_MAP: Record<ProspectStatus, ProspectStatus[]> = {
  ACTIVE: ['DROPPED', RECOMMENDED_PROSPECT_STATUS],
  DROPPED: ['REACTIVATED'],
  REACTIVATED: [RECOMMENDED_PROSPECT_STATUS, 'DROPPED'],
  RECOMMENDED: ['CONVERTED'],
  RECOMMENDED_FOR_CLIENT: ['CONVERTED'],
  CONVERTED: [], // terminal
};

const PAGE_SIZE = 20;

// ============================================================================
// Classification Tier Logic
// ============================================================================

interface ClassificationTier {
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Titanium';
  min_aum: number;
  max_aum: number | null;
}

const CLASSIFICATION_TIERS: ClassificationTier[] = [
  { tier: 'Bronze', min_aum: 0, max_aum: 1_000_000 },
  { tier: 'Silver', min_aum: 1_000_000, max_aum: 5_000_000 },
  { tier: 'Gold', min_aum: 5_000_000, max_aum: 25_000_000 },
  { tier: 'Platinum', min_aum: 25_000_000, max_aum: 100_000_000 },
  { tier: 'Titanium', min_aum: 100_000_000, max_aum: null },
];

function getClassificationTier(aum: number): string {
  for (const tier of CLASSIFICATION_TIERS) {
    if (tier.max_aum === null) {
      if (aum >= tier.min_aum) return tier.tier;
    } else {
      if (aum >= tier.min_aum && aum < tier.max_aum) return tier.tier;
    }
  }
  return 'Bronze';
}

// ============================================================================
// Ageing Indicator
// ============================================================================

type AgeingColor = 'green' | 'yellow' | 'red';

function computeAgeingIndicator(createdAt: Date): { color: AgeingColor; days: number } {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let color: AgeingColor;
  if (days < 30) {
    color = 'green';
  } else if (days <= 90) {
    color = 'yellow';
  } else {
    color = 'red';
  }

  return { color, days };
}

// ============================================================================
// Helpers
// ============================================================================

function generateProspectNumber(): string {
  const digits = String(crypto.randomInt(100_000_000)).padStart(8, '0');
  return `P-${digits}`;
}

// ============================================================================
// Prospect Service
// ============================================================================

export const prospectService = {
  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async create(data: ProspectData, userId: string): Promise<Prospect> {
    // TB-B-002: negative list hard-stop before creating a prospect
    const screenResult = await negativeListService.screenEntity({
      first_name: data.first_name ? String(data.first_name) : undefined,
      last_name: data.last_name ? String(data.last_name) : undefined,
      entity_name: data.company_name ? String(data.company_name) : undefined,
      email: data.email ? String(data.email) : undefined,
      mobile_phone: data.mobile_phone ? String(data.mobile_phone) : undefined,
    });
    await db.insert(schema.auditRecords).values({
      entity_type: 'prospect',
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
      throw new Error(`Prospect creation blocked: entity matched negative list (${screenResult.matches.map((m: { list_type: string }) => m.list_type).join(', ')})`);
    }

    const prospect_code = generateProspectNumber();

    const aum = data.total_aum ? Number(data.total_aum) : 0;
    const classification = getClassificationTier(aum);

    const [prospect] = await db
      .insert(schema.prospects)
      .values({
        prospect_code,
        lead_id: data.lead_id ? Number(data.lead_id) : null,
        entity_type: (data.entity_type as 'INDIVIDUAL' | 'NON_INDIVIDUAL') || 'INDIVIDUAL',
        salutation: data.salutation ? String(data.salutation) : null,
        first_name: String(data.first_name),
        middle_name: data.middle_name ? String(data.middle_name) : null,
        last_name: String(data.last_name),
        date_of_birth: data.date_of_birth ? String(data.date_of_birth) : null,
        gender: data.gender ? String(data.gender) : null,
        nationality: data.nationality ? String(data.nationality) : null,
        tax_id: data.tax_id ? String(data.tax_id) : null,
        email: data.email ? String(data.email) : null,
        mobile_phone: data.mobile_phone ? String(data.mobile_phone) : null,
        office_phone: data.office_phone ? String(data.office_phone) : null,
        residential_address: data.residential_address || null,
        correspondence_address: data.correspondence_address || null,
        company_name: data.company_name ? String(data.company_name) : null,
        designation: data.designation ? String(data.designation) : null,
        employer: data.employer ? String(data.employer) : null,
        annual_income: data.annual_income ? String(data.annual_income) : null,
        net_worth: data.net_worth ? String(data.net_worth) : null,
        total_aum: data.total_aum ? String(data.total_aum) : null,
        risk_profile: data.risk_profile ? (data.risk_profile as any) : null,
        investment_horizon: data.investment_horizon ? String(data.investment_horizon) : null,
        product_interests: data.product_interests || '[]',
        client_category: classification,
        country_of_residence: data.country_of_residence ? String(data.country_of_residence) : null,
        marital_status: data.marital_status ? String(data.marital_status) : null,
        country_code: data.country_code ? String(data.country_code) : null,
        primary_contact_no: data.primary_contact_no ? String(data.primary_contact_no) : null,
        fixed_line_no: data.fixed_line_no ? String(data.fixed_line_no) : null,
        gross_monthly_income: data.gross_monthly_income ? String(data.gross_monthly_income) : null,
        aum_currency: data.aum_currency ? String(data.aum_currency) : DEFAULT_CURRENCY,
        trv: data.trv ? String(data.trv) : null,
        trv_currency: data.trv_currency ? String(data.trv_currency) : DEFAULT_CURRENCY,
        prospect_status: 'ACTIVE',
        assigned_rm_id: data.assigned_rm_id ? Number(data.assigned_rm_id) : null,
        source_campaign_id: data.source_campaign_id ? Number(data.source_campaign_id) : null,
        source_lead_id: data.source_lead_id ? Number(data.source_lead_id) : null,
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
      entity_type: 'prospect',
      entity_id: String(prospect.id),
      action: 'CONSENT_CAPTURED',
      actor_id: userId,
      changes: { marketing_consent: true, captured_at: new Date().toISOString() },
    } as any);

    return prospect;
  },

  async getById(id: number): Promise<Prospect & {
    familyMembers: ProspectFamilyMember[];
    addresses: ProspectAddress[];
    identifications: ProspectIdentification[];
    lifestyle: ProspectLifestyle[];
    documents: ProspectDocument[];
    ageing_indicator: { color: string; days: number };
    classification_tier: string;
  }> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, id), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    // Fetch sub-entities
    const familyMembers = await db
      .select()
      .from(schema.prospectFamilyMembers)
      .where(and(eq(schema.prospectFamilyMembers.prospect_id, id), eq(schema.prospectFamilyMembers.is_deleted, false)));

    const addresses = await db
      .select()
      .from(schema.prospectAddresses)
      .where(and(eq(schema.prospectAddresses.prospect_id, id), eq(schema.prospectAddresses.is_deleted, false)));

    const identifications = await db
      .select()
      .from(schema.prospectIdentifications)
      .where(and(eq(schema.prospectIdentifications.prospect_id, id), eq(schema.prospectIdentifications.is_deleted, false)));

    const lifestyle = await db
      .select()
      .from(schema.prospectLifestyle)
      .where(and(eq(schema.prospectLifestyle.prospect_id, id), eq(schema.prospectLifestyle.is_deleted, false)));

    const documents = await db
      .select()
      .from(schema.prospectDocuments)
      .where(and(eq(schema.prospectDocuments.prospect_id, id), eq(schema.prospectDocuments.is_deleted, false)));

    // Ageing indicator
    const ageing = computeAgeingIndicator(prospect.created_at);

    // Classification tier
    const tier = getClassificationTier(Number(prospect.total_aum || 0));

    return {
      ...prospect,
      familyMembers,
      addresses,
      identifications,
      lifestyle,
      documents,
      ageing_indicator: ageing,
      classification_tier: tier,
    };
  },

  async update(id: number, data: ProspectData, userId: string): Promise<Prospect> {
    const [existing] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, id), eq(schema.prospects.is_deleted, false)));
    if (!existing) throw new Error('Prospect not found');

    if (existing.prospect_status === 'CONVERTED') {
      throw new Error('Cannot edit a CONVERTED prospect');
    }

    const updatePayload: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date(),
    };

    const editableFields = [
      'salutation', 'first_name', 'middle_name', 'last_name',
      'date_of_birth', 'gender', 'nationality', 'tax_id',
      'email', 'mobile_phone', 'office_phone',
      'residential_address', 'correspondence_address',
      'company_name', 'designation', 'employer',
      'annual_income', 'net_worth', 'total_aum',
      'risk_profile', 'investment_horizon', 'product_interests',
      'country_of_residence', 'marital_status', 'country_code',
      'primary_contact_no', 'fixed_line_no', 'gross_monthly_income',
      'aum_currency', 'trv', 'trv_currency', 'risk_profile_comments',
      'assigned_rm_id', 'referral_type', 'referral_id', 'branch_id',
      'cif_number',
    ];

    for (const key of editableFields) {
      if (data[key] !== undefined) {
        updatePayload[key] = data[key];
      }
    }

    // Recalculate classification tier if AUM changed
    if (data.total_aum !== undefined) {
      updatePayload.client_category = getClassificationTier(Number(data.total_aum || 0));
    }

    const [updated] = await db
      .update(schema.prospects)
      .set(updatePayload as any)
      .where(eq(schema.prospects.id, id))
      .returning();

    // BRD G-05: field-level audit record
    const changedFields = Object.keys(updatePayload).filter((k) => k !== 'updated_by' && k !== 'updated_at');
    if (changedFields.length > 0) {
      const changes: Record<string, unknown> = {};
      for (const key of changedFields) {
        changes[key] = { from: (existing as Record<string, unknown>)[key], to: updatePayload[key] };
      }
      await db.insert(schema.auditRecords).values({
        entity_type: 'prospect',
        entity_id: String(id),
        action: 'UPDATE',
        actor_id: userId,
        changes,
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
    classification_tier?: string;
    page?: number;
    userRole?: string;
    userId?: string;
    userBranchId?: number;
  }): Promise<{
    data: (Prospect & { ageing_indicator: { color: string; days: number }; classification_tier: string })[];
    pagination: { page: number; page_size: number; total: number; total_pages: number };
  }> {
    const page = filters.page || 1;
    const offset = (page - 1) * PAGE_SIZE;

    const conditions: ReturnType<typeof eq>[] = [eq(schema.prospects.is_deleted, false)];

    // RM ownership filtering
    if (filters.userRole === 'RELATIONSHIP_MANAGER' && filters.userId) {
      conditions.push(eq(schema.prospects.assigned_rm_id, Number(filters.userId)));
    } else if (filters.userRole === 'SENIOR_RM' && filters.userBranchId) {
      conditions.push(eq(schema.prospects.branch_id, filters.userBranchId));
    }

    if (filters.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(schema.prospects.prospect_status, filters.statuses as any));
    }

    if (filters.aum_min !== undefined) {
      conditions.push(gte(sql`CAST(${schema.prospects.total_aum} AS numeric)`, filters.aum_min));
    }
    if (filters.aum_max !== undefined) {
      conditions.push(lte(sql`CAST(${schema.prospects.total_aum} AS numeric)`, filters.aum_max));
    }

    if (filters.date_from) {
      conditions.push(gte(schema.prospects.created_at, new Date(filters.date_from)));
    }
    if (filters.date_to) {
      conditions.push(lte(schema.prospects.created_at, new Date(filters.date_to)));
    }

    if (filters.assigned_rm_id) {
      conditions.push(eq(schema.prospects.assigned_rm_id, filters.assigned_rm_id));
    }
    if (filters.branch_id) {
      conditions.push(eq(schema.prospects.branch_id, filters.branch_id));
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.prospects)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(schema.prospects)
      .where(and(...conditions))
      .orderBy(desc(schema.prospects.created_at))
      .limit(PAGE_SIZE)
      .offset(offset);

    // Enrich with ageing & tier
    const enriched = rows.map((row: any) => ({
      ...row,
      ageing_indicator: computeAgeingIndicator(row.created_at),
      classification_tier: getClassificationTier(Number(row.total_aum || 0)),
    }));

    return {
      data: enriched,
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

  async drop(id: number, dropReason: string, userId: string, userRole?: string): Promise<Prospect> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, id), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    // G-23: Only the assigned RM or a supervisor may drop a prospect
    const isSupervisor = userRole && ['SENIOR_RM', 'BO_HEAD', 'SYSTEM_ADMIN'].includes(userRole);
    const numericUserId = parseInt(userId, 10);
    if (!isSupervisor && prospect.assigned_rm_id !== null && prospect.assigned_rm_id !== undefined && prospect.assigned_rm_id !== numericUserId) {
      throw new Error('Only the assigned Relationship Manager or a supervisor can drop this prospect');
    }

    const allowed = TRANSITION_MAP[prospect.prospect_status as ProspectStatus];
    if (!allowed || !allowed.includes('DROPPED')) {
      throw new Error(`Cannot drop a prospect in ${prospect.prospect_status} status`);
    }

    if (!dropReason || dropReason.trim().length < 10) {
      throw new Error('drop_reason is mandatory and must be at least 10 characters');
    }

    const [updated] = await db
      .update(schema.prospects)
      .set({
        prospect_status: 'DROPPED',
        drop_reason: dropReason,
        drop_date: new Date(),
        updated_by: userId,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.prospects.id, id))
      .returning();

    await db.insert(schema.auditRecords).values({
      entity_type: 'prospect',
      entity_id: String(id),
      action: 'UPDATE',
      actor_id: userId,
      changes: { status: { from: prospect.prospect_status, to: 'DROPPED' }, drop_reason: dropReason },
    } as any);

    return updated;
  },

  async reactivate(id: number, userId: string, userRole?: string): Promise<Prospect> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, id), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    // G-23: Only the assigned RM or a supervisor may reactivate a prospect
    const isSupervisor = userRole && ['SENIOR_RM', 'BO_HEAD', 'SYSTEM_ADMIN'].includes(userRole);
    const numericUserId = parseInt(userId, 10);
    if (!isSupervisor && prospect.assigned_rm_id !== null && prospect.assigned_rm_id !== undefined && prospect.assigned_rm_id !== numericUserId) {
      throw new Error('Only the assigned Relationship Manager or a supervisor can reactivate this prospect');
    }

    if (prospect.prospect_status !== 'DROPPED') {
      throw new Error('Only DROPPED prospects can be reactivated');
    }

    const [updated] = await db
      .update(schema.prospects)
      .set({
        prospect_status: 'REACTIVATED',
        reactivation_date: new Date(),
        drop_reason: null,
        updated_by: userId,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.prospects.id, id))
      .returning();

    await db.insert(schema.auditRecords).values({
      entity_type: 'prospect',
      entity_id: String(id),
      action: 'UPDATE',
      actor_id: userId,
      changes: { status: { from: 'DROPPED', to: 'REACTIVATED' } },
    } as any);

    return updated;
  },

  async recommend(id: number, userId: string): Promise<Prospect> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, id), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    const allowed = TRANSITION_MAP[prospect.prospect_status as ProspectStatus];
    if (!allowed || !allowed.includes(RECOMMENDED_PROSPECT_STATUS)) {
      throw new Error(`Cannot recommend a prospect in ${prospect.prospect_status} status`);
    }

    // G-030: Validate all 25 mandatory fields required for RECOMMENDED_FOR_CLIENT status
    const missingFields: string[] = [];
    if (!prospect.first_name) missingFields.push('first_name');
    if (!prospect.last_name) missingFields.push('last_name');
    if (!prospect.date_of_birth) missingFields.push('date_of_birth');
    if (!prospect.gender) missingFields.push('gender');
    if (!prospect.nationality) missingFields.push('nationality');
    if (!prospect.tax_id) missingFields.push('tax_id');
    if (!prospect.email) missingFields.push('email');
    if (!prospect.primary_contact_no && !prospect.mobile_phone) missingFields.push('primary_contact_no or mobile_phone');
    if (!prospect.residential_address) missingFields.push('residential_address');
    if (!prospect.country_of_residence) missingFields.push('country_of_residence');
    if (!prospect.marital_status) missingFields.push('marital_status');
    if (!prospect.annual_income) missingFields.push('annual_income');
    if (!prospect.net_worth) missingFields.push('net_worth');
    if (!prospect.total_aum) missingFields.push('total_aum');
    if (!prospect.risk_profile) missingFields.push('risk_profile');
    if (!prospect.investment_horizon) missingFields.push('investment_horizon');
    if (!prospect.client_category) missingFields.push('client_category');
    if (!prospect.gross_monthly_income) missingFields.push('gross_monthly_income');
    if (!prospect.aum_currency) missingFields.push('aum_currency');
    if (!prospect.trv) missingFields.push('trv');
    if (missingFields.length > 0) {
      throw new Error(`Cannot recommend: the following ${missingFields.length} field(s) are required — ${missingFields.join(', ')}`);
    }

    const [updated] = await db
      .update(schema.prospects)
      .set({
        prospect_status: RECOMMENDED_PROSPECT_STATUS,
        updated_by: userId,
        updated_at: new Date(),
      } as any)
      .where(eq(schema.prospects.id, id))
      .returning();

    await db.insert(schema.auditRecords).values({
      entity_type: 'prospect',
      entity_id: String(id),
      action: 'UPDATE',
      actor_id: userId,
      changes: { status: { from: prospect.prospect_status, to: RECOMMENDED_PROSPECT_STATUS } },
    } as any);

    return updated;
  },

  getAgeingIndicator(createdAt: Date): { color: string; days: number } {
    return computeAgeingIndicator(createdAt);
  },

  getClassificationTier(aum: number): string {
    return getClassificationTier(aum);
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Family Members
  // --------------------------------------------------------------------------

  async addFamilyMember(prospectId: number, data: Record<string, unknown>, userId: string): Promise<ProspectFamilyMember> {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId));
    if (!prospect) throw new Error('Prospect not found');
    if (prospect.prospect_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED prospect');

    const [member] = await db
      .insert(schema.prospectFamilyMembers)
      .values({
        prospect_id: prospectId,
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

  async updateFamilyMember(memberId: number, data: Record<string, unknown>, userId: string): Promise<ProspectFamilyMember> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['relationship', 'first_name', 'last_name', 'date_of_birth', 'occupation', 'contact_number']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.prospectFamilyMembers)
      .set(updatePayload as any)
      .where(eq(schema.prospectFamilyMembers.id, memberId))
      .returning();
    if (!updated) throw new Error('Family member not found');
    return updated;
  },

  async removeFamilyMember(memberId: number, userId: string): Promise<ProspectFamilyMember> {
    const [removed] = await db
      .update(schema.prospectFamilyMembers)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.prospectFamilyMembers.id, memberId))
      .returning();
    if (!removed) throw new Error('Family member not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Addresses
  // --------------------------------------------------------------------------

  async addAddress(prospectId: number, data: Record<string, unknown>, userId: string): Promise<ProspectAddress> {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId));
    if (!prospect) throw new Error('Prospect not found');
    if (prospect.prospect_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED prospect');

    const [address] = await db
      .insert(schema.prospectAddresses)
      .values({
        prospect_id: prospectId,
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

  async updateAddress(addressId: number, data: Record<string, unknown>, userId: string): Promise<ProspectAddress> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['address_type', 'address_line_1', 'address_line_2', 'city', 'state_province', 'postal_code', 'country', 'is_primary']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.prospectAddresses)
      .set(updatePayload as any)
      .where(eq(schema.prospectAddresses.id, addressId))
      .returning();
    if (!updated) throw new Error('Address not found');
    return updated;
  },

  async removeAddress(addressId: number, userId: string): Promise<ProspectAddress> {
    const [removed] = await db
      .update(schema.prospectAddresses)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.prospectAddresses.id, addressId))
      .returning();
    if (!removed) throw new Error('Address not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Identifications
  // --------------------------------------------------------------------------

  async addIdentification(prospectId: number, data: Record<string, unknown>, userId: string): Promise<ProspectIdentification> {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId));
    if (!prospect) throw new Error('Prospect not found');
    if (prospect.prospect_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED prospect');

    const [identification] = await db
      .insert(schema.prospectIdentifications)
      .values({
        prospect_id: prospectId,
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

  async updateIdentification(identificationId: number, data: Record<string, unknown>, userId: string): Promise<ProspectIdentification> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['id_type', 'id_number', 'issue_date', 'expiry_date', 'issuing_authority', 'issuing_country']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.prospectIdentifications)
      .set(updatePayload as any)
      .where(eq(schema.prospectIdentifications.id, identificationId))
      .returning();
    if (!updated) throw new Error('Identification not found');
    return updated;
  },

  async removeIdentification(identificationId: number, userId: string): Promise<ProspectIdentification> {
    const [removed] = await db
      .update(schema.prospectIdentifications)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.prospectIdentifications.id, identificationId))
      .returning();
    if (!removed) throw new Error('Identification not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Lifestyle
  // --------------------------------------------------------------------------

  async addLifestyle(prospectId: number, data: Record<string, unknown>, userId: string): Promise<ProspectLifestyle> {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId));
    if (!prospect) throw new Error('Prospect not found');
    if (prospect.prospect_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED prospect');

    const [lifestyle] = await db
      .insert(schema.prospectLifestyle)
      .values({
        prospect_id: prospectId,
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

  async updateLifestyle(lifestyleId: number, data: Record<string, unknown>, userId: string): Promise<ProspectLifestyle> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['hobbies', 'cuisine_preferences', 'sports', 'clubs_memberships', 'special_dates', 'communication_preference']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.prospectLifestyle)
      .set(updatePayload as any)
      .where(eq(schema.prospectLifestyle.id, lifestyleId))
      .returning();
    if (!updated) throw new Error('Lifestyle record not found');
    return updated;
  },

  async removeLifestyle(lifestyleId: number, userId: string): Promise<ProspectLifestyle> {
    const [removed] = await db
      .update(schema.prospectLifestyle)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.prospectLifestyle.id, lifestyleId))
      .returning();
    if (!removed) throw new Error('Lifestyle record not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Sub-Entity CRUD — Documents
  // --------------------------------------------------------------------------

  async addDocument(prospectId: number, data: Record<string, unknown>, userId: string): Promise<ProspectDocument> {
    const [prospect] = await db.select().from(schema.prospects).where(eq(schema.prospects.id, prospectId));
    if (!prospect) throw new Error('Prospect not found');
    if (prospect.prospect_status === 'CONVERTED') throw new Error('Cannot modify sub-entities of a CONVERTED prospect');

    const [document] = await db
      .insert(schema.prospectDocuments)
      .values({
        prospect_id: prospectId,
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

  async updateDocument(documentId: number, data: Record<string, unknown>, userId: string): Promise<ProspectDocument> {
    const updatePayload: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    for (const key of ['document_type', 'file_name', 'file_url', 'file_size', 'mime_type']) {
      if (data[key] !== undefined) updatePayload[key] = data[key];
    }
    const [updated] = await db
      .update(schema.prospectDocuments)
      .set(updatePayload as any)
      .where(eq(schema.prospectDocuments.id, documentId))
      .returning();
    if (!updated) throw new Error('Document not found');
    return updated;
  },

  async removeDocument(documentId: number, userId: string): Promise<ProspectDocument> {
    const [removed] = await db
      .update(schema.prospectDocuments)
      .set({ is_deleted: true, updated_by: userId, updated_at: new Date() })
      .where(eq(schema.prospectDocuments.id, documentId))
      .returning();
    if (!removed) throw new Error('Document not found');
    return removed;
  },

  // --------------------------------------------------------------------------
  // Dashboard KPIs
  // --------------------------------------------------------------------------

  async getDashboardData(userId: string, userRole: string, userBranchId?: number): Promise<{
    total: number;
    active: number;
    dropped: number;
    reactivated: number;
    recommended: number;
    converted: number;
    ageing_buckets: { green: number; yellow: number; red: number };
    status_breakdown: { prospect_status: string; count: number }[];
  }> {
    const conditions: ReturnType<typeof eq>[] = [eq(schema.prospects.is_deleted, false)];

    if (userRole === 'RELATIONSHIP_MANAGER') {
      conditions.push(eq(schema.prospects.assigned_rm_id, Number(userId)));
    } else if (userRole === 'SENIOR_RM' && userBranchId) {
      conditions.push(eq(schema.prospects.branch_id, userBranchId));
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.prospects)
      .where(and(...conditions));

    const statusCounts = await db
      .select({
        prospect_status: schema.prospects.prospect_status,
        count: count(),
      })
      .from(schema.prospects)
      .where(and(...conditions))
      .groupBy(schema.prospects.prospect_status);

    // Count by ageing bucket
    const allProspects = await db
      .select({ id: schema.prospects.id, created_at: schema.prospects.created_at })
      .from(schema.prospects)
      .where(and(...conditions));

    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    for (const p of allProspects) {
      const { color } = computeAgeingIndicator(p.created_at);
      if (color === 'green') greenCount++;
      else if (color === 'yellow') yellowCount++;
      else redCount++;
    }

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.prospect_status] = Number(row.count);
    }

    return {
      total: Number(totalResult.count),
      active: statusMap['ACTIVE'] || 0,
      dropped: statusMap['DROPPED'] || 0,
      reactivated: statusMap['REACTIVATED'] || 0,
      recommended: (statusMap['RECOMMENDED_FOR_CLIENT'] || 0) + (statusMap['RECOMMENDED'] || 0),
      converted: statusMap['CONVERTED'] || 0,
      ageing_buckets: {
        green: greenCount,
        yellow: yellowCount,
        red: redCount,
      },
      status_breakdown: statusCounts,
    };
  },

  // --------------------------------------------------------------------------
  // G-25: Bulk Prospect Upload
  // --------------------------------------------------------------------------

  /**
   * Bulk create prospects from an uploaded row array (max 500 rows).
   * Returns per-row results with success/failure details.
   */
  async bulkCreate(
    rows: Array<Record<string, unknown>>,
    userId: string,
  ): Promise<{ total: number; success_count: number; failure_count: number; results: Array<{ row: number; success: boolean; prospect_code?: string; error?: string }> }> {
    const MAX_BULK_ROWS = 500;
    if (rows.length > MAX_BULK_ROWS) {
      throw new Error(`Bulk upload limit is ${MAX_BULK_ROWS} rows. Received: ${rows.length}`);
    }

    let successCount = 0;
    let failureCount = 0;
    const results: Array<{ row: number; success: boolean; prospect_code?: string; error?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.first_name || !row.last_name) {
          throw new Error('first_name and last_name are required');
        }
        const prospect = await this.create(row as ProspectData, userId);
        successCount++;
        results.push({ row: i + 1, success: true, prospect_code: prospect.prospect_code });
      } catch (err: unknown) {
        failureCount++;
        results.push({ row: i + 1, success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { total: rows.length, success_count: successCount, failure_count: failureCount, results };
  },

  /**
   * BRD retention job: soft-delete stale dropped prospects after the configured
   * retention period. Uses drop_date first and falls back to updated_at for
   * older records that predate the explicit drop timestamp.
   */
  async processRetentionPurge(retentionDays = 365): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const purged = await db
      .update(schema.prospects)
      .set({
        is_deleted: true,
        deleted_at: new Date(),
        updated_by: 'SYSTEM_RETENTION_JOB',
        updated_at: new Date(),
      } as any)
      .where(and(
        eq(schema.prospects.is_deleted, false),
        eq(schema.prospects.prospect_status, 'DROPPED'),
        sql`COALESCE(${schema.prospects.drop_date}, ${schema.prospects.updated_at}) <= ${cutoff}`,
      ))
      .returning({ id: schema.prospects.id });

    return purged.length;
  },
};
