/**
 * Lead & Prospect Conversion Service (CRM Phase 2)
 *
 * Handles atomic conversion flows:
 * - Lead -> Prospect (with sub-entity copy)
 * - Prospect -> Customer (link to existing client)
 * - Funnel analytics
 */

import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, sql, count } from 'drizzle-orm';
import crypto from 'crypto';
import { DEFAULT_CURRENCY } from '../constants/crm';
import { trustAccountFoundationService } from './trust-account-foundation-service';

type Prospect = typeof schema.prospects.$inferSelect;

// ============================================================================
// Helpers
// ============================================================================

function generateProspectNumber(): string {
  const digits = String(crypto.randomInt(100_000_000)).padStart(8, '0');
  return `P-${digits}`;
}

// ============================================================================
// Conversion Service
// ============================================================================

export const conversionService = {
  /**
   * Convert a Lead to a Prospect.
   *
   * Requirements:
   * - Lead must be in CLIENT_ACCEPTED status
   * - Copies all lead data + sub-tables (family, addresses, identifications,
   *   lifestyle, documents) to prospect equivalents atomically
   * - Creates conversion_history record
   * - Sets lead status to CONVERTED with converted_prospect_id and conversion_date
   */
  async leadToProspect(leadId: number, userId: string): Promise<{
    lead_id: number;
    lead_code: string;
    prospect_id: number;
    prospect_code: string;
    conversion_date: string;
    sub_entities_copied: {
      family_members: number;
      addresses: number;
      identifications: number;
      lifestyle: number;
      documents: number;
    };
  }> {
    // Fetch lead (outside txn for validation)
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.is_deleted, false)));
    if (!lead) throw new Error('Lead not found');

    if (lead.lead_status !== 'CLIENT_ACCEPTED') {
      throw new Error(
        `Lead must be in CLIENT_ACCEPTED status to convert. Current status: ${lead.lead_status}`,
      );
    }

    // Generate prospect code
    const prospect_code = generateProspectNumber();

    return await db.transaction(async (tx: any) => {
      // Re-validate inside transaction to guard against concurrent conversions (TOCTOU)
      const [txLead] = await tx
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.id, leadId), eq(schema.leads.is_deleted, false)));
      if (!txLead) throw new Error('Lead not found');
      if (txLead.lead_status !== 'CLIENT_ACCEPTED') {
        throw new Error(
          `Lead must be in CLIENT_ACCEPTED status to convert. Current status: ${txLead.lead_status}`,
        );
      }

      // Create prospect from lead data
      const [prospect] = await tx
        .insert(schema.prospects)
        .values({
          prospect_code,
          lead_id: leadId,
          entity_type: lead.entity_type,
          salutation: lead.salutation,
          first_name: lead.first_name,
          middle_name: lead.middle_name,
          last_name: lead.last_name,
          date_of_birth: lead.date_of_birth,
          gender: lead.gender,
          nationality: lead.nationality,
          email: lead.email,
          mobile_phone: lead.mobile_phone,
          company_name: lead.company_name,
          country_of_residence: lead.country_of_residence,
          marital_status: lead.marital_status,
          country_code: lead.country_code,
          primary_contact_no: lead.primary_contact_no,
          fixed_line_no: lead.fixed_line_no,
          client_category: lead.client_category,
          total_aum: lead.total_aum,
          gross_monthly_income: lead.gross_monthly_income,
          aum_currency: lead.aum_currency || DEFAULT_CURRENCY,
          trv: lead.trv,
          trv_currency: lead.trv_currency || DEFAULT_CURRENCY,
          risk_profile: lead.risk_profile,
          product_interests: lead.product_interest,
          assigned_rm_id: lead.assigned_rm_id,
          source_campaign_id: lead.source_campaign_id,
          source_lead_id: leadId,
          referral_type: lead.referral_type,
          referral_id: lead.referral_id,
          branch_id: lead.branch_id,
          prospect_status: 'ACTIVE',
          negative_list_cleared: false,
          created_by: userId,
          updated_by: userId,
        })
        .returning();

      const prospectId = prospect.id;

      // Copy sub-entities: Family Members
      const familyMembers = await tx
        .select()
        .from(schema.leadFamilyMembers)
        .where(and(
          eq(schema.leadFamilyMembers.lead_id, leadId),
          eq(schema.leadFamilyMembers.is_deleted, false),
        ));

      for (const fm of familyMembers) {
        await tx.insert(schema.prospectFamilyMembers).values({
          prospect_id: prospectId,
          relationship: fm.relationship,
          first_name: fm.first_name,
          last_name: fm.last_name,
          date_of_birth: fm.date_of_birth,
          occupation: fm.occupation,
          contact_number: fm.contact_number,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Copy sub-entities: Addresses
      const addresses = await tx
        .select()
        .from(schema.leadAddresses)
        .where(and(
          eq(schema.leadAddresses.lead_id, leadId),
          eq(schema.leadAddresses.is_deleted, false),
        ));

      for (const addr of addresses) {
        await tx.insert(schema.prospectAddresses).values({
          prospect_id: prospectId,
          address_type: addr.address_type,
          address_line_1: addr.address_line_1,
          address_line_2: addr.address_line_2,
          city: addr.city,
          state_province: addr.state_province,
          postal_code: addr.postal_code,
          country: addr.country,
          is_primary: addr.is_primary,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Copy sub-entities: Identifications
      const identifications = await tx
        .select()
        .from(schema.leadIdentifications)
        .where(and(
          eq(schema.leadIdentifications.lead_id, leadId),
          eq(schema.leadIdentifications.is_deleted, false),
        ));

      for (const ident of identifications) {
        await tx.insert(schema.prospectIdentifications).values({
          prospect_id: prospectId,
          id_type: ident.id_type,
          id_number: ident.id_number,
          issue_date: ident.issue_date,
          expiry_date: ident.expiry_date,
          issuing_authority: ident.issuing_authority,
          issuing_country: ident.issuing_country,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Copy sub-entities: Lifestyle
      const lifestyle = await tx
        .select()
        .from(schema.leadLifestyle)
        .where(and(
          eq(schema.leadLifestyle.lead_id, leadId),
          eq(schema.leadLifestyle.is_deleted, false),
        ));

      for (const ls of lifestyle) {
        await tx.insert(schema.prospectLifestyle).values({
          prospect_id: prospectId,
          hobbies: ls.hobbies,
          cuisine_preferences: ls.cuisine_preferences,
          sports: ls.sports,
          clubs_memberships: ls.clubs_memberships,
          special_dates: ls.special_dates,
          communication_preference: ls.communication_preference,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Copy sub-entities: Documents
      const documents = await tx
        .select()
        .from(schema.leadDocuments)
        .where(and(
          eq(schema.leadDocuments.lead_id, leadId),
          eq(schema.leadDocuments.is_deleted, false),
        ));

      for (const doc of documents) {
        await tx.insert(schema.prospectDocuments).values({
          prospect_id: prospectId,
          document_type: doc.document_type,
          file_name: doc.file_name,
          file_url: doc.file_url,
          file_size: doc.file_size,
          mime_type: doc.mime_type,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Create conversion history record
      await tx.insert(schema.conversionHistory).values({
        source_entity_type: 'LEAD',
        source_entity_id: leadId,
        target_entity_type: 'PROSPECT',
        target_entity_id: prospectId,
        campaign_id: lead.source_campaign_id,
        converted_by: parseInt(userId),
        conversion_notes: `Lead ${lead.lead_code} converted to Prospect ${prospect_code}`,
        created_by: userId,
        updated_by: userId,
      });

      // Update lead: set CONVERTED, link prospect, set conversion_date
      await tx
        .update(schema.leads)
        .set({
          lead_status: 'CONVERTED',
          converted_prospect_id: prospectId,
          conversion_date: new Date(),
          updated_by: userId,
          updated_at: new Date(),
        } as any)
        .where(eq(schema.leads.id, leadId));

      return {
        lead_id: leadId,
        lead_code: lead.lead_code,
        prospect_id: prospectId,
        prospect_code: prospect_code,
        conversion_date: new Date().toISOString(),
        sub_entities_copied: {
          family_members: familyMembers.length,
          addresses: addresses.length,
          identifications: identifications.length,
          lifestyle: lifestyle.length,
          documents: documents.length,
        },
      };
    });
  },

  /**
   * Convert a Prospect to a Customer.
   *
   * Requirements:
 * - Prospect must be in RECOMMENDED_FOR_CLIENT status. Legacy RECOMMENDED rows are still accepted.
   * - clientId references an existing client record
   * - Creates conversion_history record
   * - Sets prospect status to CONVERTED with converted_client_id
   */
  async prospectToCustomer(prospectId: number, clientId: string, userId: string): Promise<{
    prospect_id: number;
    prospect_code: string;
    client_id: string;
    conversion_date: string;
    trust_foundation: {
      trust_account_id: string;
      portfolio_id: string;
      holding_account_count: number;
      security_account_count: number;
      settlement_account_count: number;
      mandate_count: number;
      related_party_count: number;
    };
  }> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, prospectId), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    if (prospect.prospect_status !== 'RECOMMENDED_FOR_CLIENT' && prospect.prospect_status !== 'RECOMMENDED') {
      throw new Error(
        `Prospect must be in RECOMMENDED_FOR_CLIENT status to convert. Current status: ${prospect.prospect_status}`,
      );
    }

    // Verify client exists
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId));
    if (!client) throw new Error(`Client not found: ${clientId}`);

    return await db.transaction(async (tx: any) => {
      // Create conversion history record
      await tx.insert(schema.conversionHistory).values({
        source_entity_type: 'PROSPECT',
        source_entity_id: prospectId,
        target_entity_type: 'CLIENT',
        target_client_id: clientId,
        campaign_id: prospect.source_campaign_id,
        converted_by: parseInt(userId),
        conversion_notes: `Prospect ${prospect.prospect_code} converted to Client ${clientId}`,
        created_by: userId,
        updated_by: userId,
      });

      // Update prospect: set CONVERTED, link client
      await tx
        .update(schema.prospects)
        .set({
          prospect_status: 'CONVERTED',
          converted_client_id: clientId,
          updated_by: userId,
          updated_at: new Date(),
        } as any)
        .where(eq(schema.prospects.id, prospectId))
        .returning();

      const trustFoundation = await trustAccountFoundationService.createDefaultFoundation(
        {
          client_id: clientId,
          product_type: 'IMA_DISCRETIONARY',
          account_name: `${client.legal_name || clientId} Trust Account`,
          base_currency: prospect.aum_currency || DEFAULT_CURRENCY,
          branch_id: prospect.branch_id ?? null,
          assigned_rm_id: prospect.assigned_rm_id ?? client.assigned_rm_id ?? null,
          onboarding_reference_type: 'PROSPECT',
          onboarding_reference_id: String(prospectId),
          risk_profile_snapshot: {
            prospect_risk_profile: prospect.risk_profile,
            client_risk_profile: client.risk_profile,
          },
          related_parties: [{
            party_type: 'SETTLOR',
            legal_name: client.legal_name || `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim() || clientId,
            client_id: clientId,
            authority_scope: { account_opening: true, instructions: true },
            is_authorized_signatory: true,
          }],
        },
        userId,
        tx,
      );

      return {
        prospect_id: prospectId,
        prospect_code: prospect.prospect_code,
        client_id: clientId,
        conversion_date: new Date().toISOString(),
        trust_foundation: {
          trust_account_id: trustFoundation.trust_account_id,
          portfolio_id: trustFoundation.portfolio_id,
          holding_account_count: trustFoundation.holding_account_ids.length,
          security_account_count: trustFoundation.security_account_ids.length,
          settlement_account_count: trustFoundation.settlement_account_ids.length,
          mandate_count: trustFoundation.mandate_ids.length,
          related_party_count: trustFoundation.related_party_ids.length,
        },
      };
    });
  },

  /**
   * G-026: Field-level merge comparison for Prospect-to-Customer conversion.
   *
   * Returns a side-by-side comparison of matching fields between the prospect
   * and the target client. Fields where both have data are flagged as
   * "suggested_update" so the caller can decide which value to keep.
   */
  async getMergePreview(prospectId: number, clientId: string): Promise<{
    prospect_code: string;
    client_id: string;
    fields: Array<{
      field: string;
      prospect_value: unknown;
      client_value: unknown;
      status: 'match' | 'conflict' | 'prospect_only' | 'client_only';
    }>;
  }> {
    const [prospect] = await db
      .select()
      .from(schema.prospects)
      .where(and(eq(schema.prospects.id, prospectId), eq(schema.prospects.is_deleted, false)));
    if (!prospect) throw new Error('Prospect not found');

    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.client_id, clientId));
    if (!client) throw new Error(`Client not found: ${clientId}`);

    // Map prospect fields -> client fields
    const fieldMappings: Array<{ label: string; prospectVal: unknown; clientVal: unknown }> = [
      { label: 'legal_name', prospectVal: `${prospect.first_name} ${prospect.last_name}`.trim(), clientVal: client.legal_name },
      { label: 'tax_id / tin', prospectVal: prospect.tax_id, clientVal: client.tin },
      { label: 'date_of_birth / birth_date', prospectVal: prospect.date_of_birth, clientVal: client.birth_date },
      { label: 'residential_address / address', prospectVal: prospect.residential_address, clientVal: client.address },
      { label: 'risk_profile', prospectVal: prospect.risk_profile, clientVal: client.risk_profile },
      { label: 'email', prospectVal: prospect.email, clientVal: (client.contact as Record<string, unknown>)?.email ?? null },
      { label: 'mobile_phone', prospectVal: prospect.mobile_phone, clientVal: (client.contact as Record<string, unknown>)?.mobile ?? null },
    ];

    const fields = fieldMappings.map(({ label, prospectVal, clientVal }) => {
      const hasProspect = prospectVal !== null && prospectVal !== undefined && prospectVal !== '';
      const hasClient = clientVal !== null && clientVal !== undefined && clientVal !== '';

      let status: 'match' | 'conflict' | 'prospect_only' | 'client_only';
      if (hasProspect && hasClient) {
        status = JSON.stringify(prospectVal) === JSON.stringify(clientVal) ? 'match' : 'conflict';
      } else if (hasProspect) {
        status = 'prospect_only';
      } else {
        status = 'client_only';
      }

      return { field: label, prospect_value: prospectVal ?? null, client_value: clientVal ?? null, status };
    });

    return { prospect_code: prospect.prospect_code, client_id: clientId, fields };
  },

  /**
   * Funnel analytics.
   *
   * Returns counts at each funnel stage with drop-off rates:
   * Leads -> Qualified -> Client Accepted -> Converted to Prospect
   *       -> Recommended -> Converted to Customer
   */
  async getFunnelAnalytics(opts?: { userId?: string; userRole?: string; branchId?: number }): Promise<{
    funnel: Array<{ stage: string; count: number; drop_off_rate: number }>;
    summary: {
      total_leads: number;
      total_prospects: number;
      lead_to_prospect_rate: number;
      prospect_to_customer_rate: number;
      overall_conversion_rate: number;
    };
  }> {
    // Build scope filter based on role
    const leadConditions = [eq(schema.leads.is_deleted, false)];
    const prospectConditions = [eq(schema.prospects.is_deleted, false)];

    if (opts?.userRole === 'RELATIONSHIP_MANAGER' && opts?.userId) {
      leadConditions.push(eq(schema.leads.assigned_rm_id, parseInt(opts.userId)));
      prospectConditions.push(eq(schema.prospects.assigned_rm_id, parseInt(opts.userId)));
    } else if (opts?.userRole === 'SENIOR_RM' && opts?.branchId) {
      leadConditions.push(eq(schema.leads.branch_id, opts.branchId));
      prospectConditions.push(eq(schema.prospects.branch_id, opts.branchId));
    }
    // BO_* and SYSTEM_ADMIN see everything — no extra filter

    // Lead counts by status
    const leadStatusCounts = await db
      .select({
        lead_status: schema.leads.lead_status,
        count: count(),
      })
      .from(schema.leads)
      .where(and(...leadConditions))
      .groupBy(schema.leads.lead_status);

    const leadMap: Record<string, number> = {};
    let totalLeads = 0;
    for (const row of leadStatusCounts) {
      leadMap[row.lead_status] = Number(row.count);
      totalLeads += Number(row.count);
    }

    // Prospect counts by status
    const prospectStatusCounts = await db
      .select({
        prospect_status: schema.prospects.prospect_status,
        count: count(),
      })
      .from(schema.prospects)
      .where(and(...prospectConditions))
      .groupBy(schema.prospects.prospect_status);

    const prospectMap: Record<string, number> = {};
    let totalProspects = 0;
    for (const row of prospectStatusCounts) {
      prospectMap[row.prospect_status] = Number(row.count);
      totalProspects += Number(row.count);
    }

    // Funnel stages
    const qualified = leadMap['QUALIFIED'] || 0;
    const clientAccepted = leadMap['CLIENT_ACCEPTED'] || 0;
    const convertedToProspect = leadMap['CONVERTED'] || 0;
    const recommended = (prospectMap['RECOMMENDED_FOR_CLIENT'] || 0) + (prospectMap['RECOMMENDED'] || 0);
    const convertedToCustomer = prospectMap['CONVERTED'] || 0;

    // Drop-off rates
    const calcDropOff = (from: number, to: number) =>
      from > 0 ? Math.round(((from - to) / from) * 10000) / 100 : 0;

    return {
      funnel: [
        { stage: 'Total Leads', count: totalLeads, drop_off_rate: 0 },
        { stage: 'Qualified', count: qualified, drop_off_rate: calcDropOff(totalLeads, qualified) },
        { stage: 'Client Accepted', count: clientAccepted, drop_off_rate: calcDropOff(qualified, clientAccepted) },
        { stage: 'Converted to Prospect', count: convertedToProspect, drop_off_rate: calcDropOff(clientAccepted, convertedToProspect) },
        { stage: 'Recommended', count: recommended, drop_off_rate: calcDropOff(convertedToProspect, recommended) },
        { stage: 'Converted to Customer', count: convertedToCustomer, drop_off_rate: calcDropOff(recommended, convertedToCustomer) },
      ],
      summary: {
        total_leads: totalLeads,
        total_prospects: totalProspects,
        lead_to_prospect_rate: totalLeads > 0 ? Math.round((convertedToProspect / totalLeads) * 10000) / 100 : 0,
        prospect_to_customer_rate: totalProspects > 0 ? Math.round((convertedToCustomer / totalProspects) * 10000) / 100 : 0,
        overall_conversion_rate: totalLeads > 0 ? Math.round((convertedToCustomer / totalLeads) * 10000) / 100 : 0,
      },
    };
  },
};
