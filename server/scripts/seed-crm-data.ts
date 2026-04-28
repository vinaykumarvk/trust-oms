/**
 * seed-crm-data.ts — TrustOMS Philippines CRM Full Seed
 *
 * Populates ALL CRM tables with realistic Philippine banking data
 * while maintaining full referential integrity.
 *
 * Seeding order (respects FK dependencies):
 *  1. lead_rules
 *  2. campaigns
 *  3. lead_lists
 *  4. leads
 *  5. lead enrichment (family, addresses, IDs, lifestyle)
 *  6. lead_list_members
 *  7. campaign_lists
 *  8. campaign_responses
 *  9. campaign_communications
 * 10. prospects (from leads + standalone)
 * 11. prospect enrichment
 * 12. campaign_consent_log
 * 13. meeting_invitees (for existing meetings)
 * 14. call_report_feedback
 * 15. call_report_approvals
 * 16. opportunities (extended)
 * 17. crm_tasks
 * 18. crm_notifications
 * 19. rm_handovers
 * 20. crm_expenses
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/seed-crm-data.ts
 *
 * Safe to run repeatedly — uses upsert/skip-if-exists patterns.
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { fileURLToPath } from 'url';

// ─── helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function dateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

async function getUserIds(): Promise<Record<string, number>> {
  const users = await db.select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.is_active, true));

  const map: Record<string, number> = {};
  for (const u of users) {
    if (u.username) map[u.username] = u.id;
  }
  return map;
}

async function getMeetingIds(): Promise<Record<string, number>> {
  const rows = await db.select({ id: schema.meetings.id, meeting_code: schema.meetings.meeting_code })
    .from(schema.meetings);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.meeting_code) map[r.meeting_code] = r.id;
  }
  return map;
}

async function getCallReportIds(): Promise<Record<string, number>> {
  const rows = await db.select({ id: schema.callReports.id, report_code: schema.callReports.report_code })
    .from(schema.callReports);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.report_code) map[r.report_code] = r.id;
  }
  return map;
}

// ─── 1. lead_rules ───────────────────────────────────────────────────────────

async function seedLeadRules(userIds: Record<string, number>) {
  console.log('\n[1] Seeding lead_rules...');

  const rows = [
    {
      rule_name: 'HNW Prospects — Manila (AUM > PHP 10M)',
      criteria_name: 'hnw_manila',
      criteria_json: {
        conditions: [
          { field: 'total_aum', operator: 'gte', value: 10_000_000 },
          { field: 'region', operator: 'eq', value: 'NCR' },
        ],
        logic: 'AND',
      },
      is_active: true,
      last_generated_count: 47,
      last_generated_at: daysAgo(7),
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      rule_name: 'Bond Investors — Fixed Income Interest',
      criteria_name: 'bond_investors',
      criteria_json: {
        conditions: [
          { field: 'risk_profile', operator: 'in', value: ['CONSERVATIVE', 'MODERATE'] },
          { field: 'product_interest', operator: 'contains', value: 'BONDS' },
        ],
        logic: 'AND',
      },
      is_active: true,
      last_generated_count: 23,
      last_generated_at: daysAgo(14),
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      rule_name: 'UITF Cross-Sell — Existing CASA Clients',
      criteria_name: 'uitf_casa_crosssell',
      criteria_json: {
        conditions: [
          { field: 'client_category', operator: 'eq', value: 'RETAIL_BANKING' },
          { field: 'estimated_aum', operator: 'gte', value: 500_000 },
        ],
        logic: 'AND',
      },
      is_active: true,
      last_generated_count: 112,
      last_generated_at: daysAgo(3),
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
  ];

  const ids: number[] = [];
  for (const r of rows) {
    const [inserted] = await db.insert(schema.leadRules).values(r as any).returning({ id: schema.leadRules.id });
    ids.push(inserted.id);
  }

  console.log(`  → ${ids.length} lead rules seeded`);
  return ids;
}

// ─── 2. campaigns ────────────────────────────────────────────────────────────

async function seedCampaigns(userIds: Record<string, number>) {
  console.log('\n[2] Seeding campaigns...');

  const rmId1 = userIds['rm_1'] ?? 1;
  const rmId2 = userIds['rm_2'] ?? 2;
  const rmId3 = userIds['rm_3'] ?? 3;
  const headId = userIds['bo_head'] ?? 4;

  const rows = [
    {
      campaign_code: 'CMP-2026-001',
      name: 'Q1 2026 — GCash UITF Top-Up Drive',
      description: 'Re-engage existing UITF holders to increase subscription via GCash digital onboarding.',
      campaign_type: 'UP_SELL' as const,
      campaign_status: 'COMPLETED' as const,
      start_date: dateStr(daysAgo(90)),
      end_date: dateStr(daysAgo(30)),
      channel: 'EMAIL' as const,
      budget_amount: '500000',
      actual_spend: '423500',
      advertisement_cost: '150000',
      campaign_cost: '273500',
      campaign_manager_id: rmId1,
      owner_user_id: rmId1,
      approved_by: headId,
      approved_at: daysAgo(95),
      email_subject: 'Grow Your UITF Portfolio — Exclusive Top-Up Offer',
      email_body: 'Dear Valued Investor, we invite you to take advantage of our UITF top-up promotion for Q1 2026...',
      email_signature: 'Trust Banking Division, ABC Bank Philippines',
      created_by_user_id: rmId1,
    },
    {
      campaign_code: 'CMP-2026-002',
      name: 'ROP Bond Subscription — April 2026',
      description: 'Targeted offering of Republic of the Philippines government bonds to HNW clients and prospects.',
      campaign_type: 'PRODUCT_LAUNCH' as const,
      campaign_status: 'ACTIVE' as const,
      start_date: dateStr(daysAgo(15)),
      end_date: dateStr(daysFromNow(15)),
      channel: 'EMAIL' as const,
      budget_amount: '750000',
      actual_spend: '312000',
      advertisement_cost: '200000',
      campaign_cost: '112000',
      campaign_manager_id: rmId2,
      owner_user_id: rmId2,
      approved_by: headId,
      approved_at: daysAgo(18),
      email_subject: 'Exclusive Invitation: ROP Government Bond — 6.5% p.a.',
      email_body: 'Dear Client, we are pleased to offer you priority access to the latest ROP bond issuance...',
      email_signature: 'Private Banking Team, ABC Bank Philippines',
      sms_content: 'ABC Bank: You\'re invited to subscribe to ROP Gov\'t Bonds @ 6.5% p.a. Call your RM today.',
      created_by_user_id: rmId2,
    },
    {
      campaign_code: 'CMP-2026-003',
      name: 'Annual Portfolio Review — Relationship Building',
      description: 'Annual outreach to all active clients for portfolio review appointments.',
      campaign_type: 'RETENTION' as const,
      campaign_status: 'ACTIVE' as const,
      start_date: dateStr(daysAgo(5)),
      end_date: dateStr(daysFromNow(25)),
      channel: 'MIXED' as const,
      budget_amount: '300000',
      actual_spend: '45000',
      advertisement_cost: '0',
      campaign_cost: '45000',
      campaign_manager_id: rmId1,
      owner_user_id: rmId1,
      approved_by: headId,
      approved_at: daysAgo(8),
      email_subject: 'Your Annual Portfolio Review — Let\'s Connect',
      email_body: 'Dear [Client Name], as part of our commitment to your financial goals, we\'d like to schedule your annual portfolio review...',
      email_signature: 'Your Relationship Manager, ABC Bank Trust',
      sms_content: 'ABC Bank: Your annual portfolio review is due. Reply YES to schedule or call your RM.',
      created_by_user_id: rmId1,
    },
    {
      campaign_code: 'CMP-2026-004',
      name: 'New HNW Acquisition — Cebu & Davao Markets',
      description: 'Prospect acquisition campaign targeting high-net-worth individuals in Cebu and Davao.',
      campaign_type: 'REFERRAL' as const,
      campaign_status: 'DRAFT' as const,
      start_date: dateStr(daysFromNow(10)),
      end_date: dateStr(daysFromNow(70)),
      channel: 'EMAIL' as const,
      budget_amount: '1000000',
      actual_spend: '0',
      advertisement_cost: '400000',
      campaign_cost: '600000',
      campaign_manager_id: rmId3,
      owner_user_id: rmId3,
      email_subject: 'Experience Personalized Trust Banking — ABC Bank',
      email_body: 'We are pleased to introduce you to ABC Bank\'s Trust Banking services designed for discerning investors...',
      email_signature: 'Private Banking, Cebu Branch',
      created_by_user_id: rmId3,
    },
  ];

  const ids: Record<string, number> = {};
  for (const r of rows) {
    const ex = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.campaign_code, r.campaign_code)).limit(1);
    if (ex.length) { ids[r.campaign_code] = ex[0].id; continue; }
    const [ins] = await db.insert(schema.campaigns).values(r as any).returning({ id: schema.campaigns.id });
    ids[r.campaign_code] = ins.id;
  }

  console.log(`  → ${Object.keys(ids).length} campaigns seeded`);
  return ids;
}

// ─── 3. lead_lists ───────────────────────────────────────────────────────────

async function seedLeadLists(userIds: Record<string, number>, ruleIds: number[]) {
  console.log('\n[3] Seeding lead_lists...');

  const rows = [
    {
      list_code: 'LL-2026-001',
      name: 'HNW Prospects — Manila Q1 2026',
      description: 'Rule-generated list of high-net-worth prospects in Metro Manila.',
      source_type: 'RULE_BASED' as const,
      source_rule_id: ruleIds[0],
      rule_definition: { rule_code: 'hnw_manila', threshold_aum: 10_000_000, region: 'NCR' },
      total_count: 47,
      is_active: true,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      list_code: 'LL-2026-002',
      name: 'Bond Investor Prospects — April 2026',
      description: 'Manually uploaded list of identified bond investors from branch referrals.',
      source_type: 'UPLOADED' as const,
      total_count: 23,
      is_active: true,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      list_code: 'LL-2026-003',
      name: 'UITF Top-Up Candidates',
      description: 'Existing UITF holders eligible for top-up promotion.',
      source_type: 'RULE_BASED' as const,
      source_rule_id: ruleIds[2],
      rule_definition: { rule_code: 'uitf_casa_crosssell', min_balance: 500_000 },
      total_count: 112,
      is_active: true,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      list_code: 'LL-2026-004',
      name: 'Cebu-Davao HNW Acquisition List',
      description: 'Manually curated list for Cebu and Davao expansion.',
      source_type: 'MANUAL' as const,
      total_count: 18,
      is_active: true,
      created_by_user_id: userIds['rm_3'] ?? 3,
    },
  ];

  const ids: Record<string, number> = {};
  for (const r of rows) {
    const ex = await db.select().from(schema.leadLists)
      .where(eq(schema.leadLists.list_code, r.list_code)).limit(1);
    if (ex.length) { ids[r.list_code] = ex[0].id; continue; }
    const [ins] = await db.insert(schema.leadLists).values(r as any).returning({ id: schema.leadLists.id });
    ids[r.list_code] = ins.id;
  }

  console.log(`  → ${Object.keys(ids).length} lead lists seeded`);
  return ids;
}

// ─── 4. leads ────────────────────────────────────────────────────────────────

async function seedLeads(userIds: Record<string, number>, campaignIds: Record<string, number>) {
  console.log('\n[4] Seeding leads...');

  const rmId1 = userIds['rm_1'] ?? 1;
  const rmId2 = userIds['rm_2'] ?? 2;
  const rmId3 = userIds['rm_3'] ?? 3;
  const cmp1Id = campaignIds['CMP-2026-001'];
  const cmp2Id = campaignIds['CMP-2026-002'];
  const cmp3Id = campaignIds['CMP-2026-003'];
  const cmp4Id = campaignIds['CMP-2026-004'];

  const rows = [
    // QUALIFIED leads — warm prospects from campaign
    {
      lead_code: 'LEAD-001',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Mr.',
      first_name: 'Ramon',
      last_name: 'Villanueva',
      date_of_birth: '1975-03-14',
      gender: 'M',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Married',
      occupation: 'Business Owner',
      industry: 'Real Estate',
      email: 'rvillanueva@prospects.local',
      mobile_phone: '09171234001',
      country_code: '+63',
      source: 'CAMPAIGN' as const,
      source_campaign_id: cmp2Id,
      lead_status: 'QUALIFIED' as const,
      assigned_rm_id: rmId2,
      client_category: 'HNW',
      total_aum: '45000000',
      estimated_aum: '50000000',
      aum_currency: 'PHP',
      risk_profile: 'MODERATE' as const,
      product_interest: JSON.stringify(['BONDS', 'IMA_DIRECTED']),
      notes: 'Interested in ROP bonds, owns 3 commercial properties in BGC. Referral from Eduardo Tan (CLT-001).',
      marketing_consent: true,
      marketing_consent_date: daysAgo(20),
      politically_exposed: false,
      created_by_user_id: rmId2,
    },
    {
      lead_code: 'LEAD-002',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Ms.',
      first_name: 'Cecilia',
      last_name: 'Orozco-Mañalac',
      date_of_birth: '1968-11-25',
      gender: 'F',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Widowed',
      occupation: 'Retired Executive',
      industry: 'Banking',
      email: 'cmanhalac@prospects.local',
      mobile_phone: '09189876002',
      country_code: '+63',
      source: 'REFERRAL' as const,
      lead_status: 'CONTACTED' as const,
      assigned_rm_id: rmId1,
      client_category: 'HNW',
      total_aum: '120000000',
      estimated_aum: '130000000',
      aum_currency: 'PHP',
      risk_profile: 'CONSERVATIVE' as const,
      product_interest: JSON.stringify(['UITF', 'BONDS', 'ESCROW']),
      notes: 'Former BancNet CFO. Interested in capital preservation. Currently with competitor bank. Initial call done.',
      marketing_consent: true,
      marketing_consent_date: daysAgo(45),
      politically_exposed: false,
      referral_type: 'CLIENT',
      referral_id: 'CLT-002',
      created_by_user_id: rmId1,
    },
    {
      lead_code: 'LEAD-003',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Engr.',
      first_name: 'Ferdinand',
      last_name: 'Casimiro',
      date_of_birth: '1982-07-08',
      gender: 'M',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Married',
      occupation: 'Civil Engineer',
      industry: 'Construction',
      email: 'fcasimiro@prospects.local',
      mobile_phone: '09201234003',
      country_code: '+63',
      source: 'CAMPAIGN' as const,
      source_campaign_id: cmp1Id,
      lead_status: 'CONVERTED' as const,
      assigned_rm_id: rmId1,
      client_category: 'HNW',
      total_aum: '22000000',
      estimated_aum: '25000000',
      aum_currency: 'PHP',
      risk_profile: 'MODERATE' as const,
      product_interest: JSON.stringify(['UITF', 'IMA_DISCRETIONARY']),
      notes: 'Successfully converted to prospect after UITF top-up campaign response. Now onboarding.',
      marketing_consent: true,
      marketing_consent_date: daysAgo(60),
      politically_exposed: false,
      created_by_user_id: rmId1,
    },
    {
      lead_code: 'LEAD-004',
      entity_type: 'NON_INDIVIDUAL' as const,
      entity_name: 'Visayas Agritech Corporation',
      company_name: 'Visayas Agritech Corporation',
      first_name: 'Rolando',  // Authorized representative
      last_name: 'Gutierrez',
      email: 'rgutierrez@visayasagritech.local',
      mobile_phone: '09321234004',
      country_code: '+63',
      source: 'WALK_IN' as const,
      lead_status: 'NEW' as const,
      assigned_rm_id: rmId3,
      client_category: 'CORPORATE',
      estimated_aum: '80000000',
      aum_currency: 'PHP',
      risk_profile: 'MODERATE' as const,
      product_interest: JSON.stringify(['IMA_DIRECTED', 'ESCROW']),
      notes: 'Cebu-based agritech company. Looking to invest surplus funds in trust. Walk-in inquiry at Cebu branch.',
      marketing_consent: false,
      politically_exposed: false,
      created_by_user_id: rmId3,
    },
    {
      lead_code: 'LEAD-005',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Atty.',
      first_name: 'Maribel',
      last_name: 'Santos-Cruz',
      date_of_birth: '1979-09-19',
      gender: 'F',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Single',
      occupation: 'Lawyer',
      industry: 'Legal Services',
      email: 'msantoscruz@prospects.local',
      mobile_phone: '09171234005',
      country_code: '+63',
      source: 'CAMPAIGN' as const,
      source_campaign_id: cmp3Id,
      lead_status: 'CONTACTED' as const,
      assigned_rm_id: rmId1,
      client_category: 'HNW',
      total_aum: '18000000',
      estimated_aum: '20000000',
      aum_currency: 'PHP',
      risk_profile: 'MODERATE' as const,
      product_interest: JSON.stringify(['UITF', 'BONDS']),
      notes: 'Responded to annual review campaign. Expressed interest in bond ladder strategy.',
      marketing_consent: true,
      marketing_consent_date: daysAgo(10),
      politically_exposed: false,
      created_by_user_id: rmId1,
    },
    {
      lead_code: 'LEAD-006',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Dr.',
      first_name: 'Eduardo',
      last_name: 'Reyes Jr.',
      date_of_birth: '1965-04-02',
      gender: 'M',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Married',
      occupation: 'Physician / Hospital Owner',
      industry: 'Healthcare',
      email: 'edreyes@prospects.local',
      mobile_phone: '09189876006',
      country_code: '+63',
      source: 'REFERRAL' as const,
      lead_status: 'QUALIFIED' as const,
      assigned_rm_id: rmId2,
      client_category: 'UHNW',
      total_aum: '250000000',
      estimated_aum: '280000000',
      aum_currency: 'PHP',
      risk_profile: 'MODERATE' as const,
      product_interest: JSON.stringify(['IMA_DISCRETIONARY', 'BONDS', 'UITF']),
      notes: 'Owner of 3 hospitals in Metro Manila. Referred by compliance_officer. Priority prospect for Q2.',
      marketing_consent: true,
      marketing_consent_date: daysAgo(8),
      politically_exposed: false,
      referral_type: 'STAFF',
      referral_id: String(userIds['compliance_officer'] ?? 0),
      created_by_user_id: rmId2,
    },
    {
      lead_code: 'LEAD-007',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Mr.',
      first_name: 'Dante',
      last_name: 'Ilagan',
      date_of_birth: '1970-12-30',
      gender: 'M',
      nationality: 'Filipino',
      country_of_residence: 'Philippines',
      marital_status: 'Married',
      occupation: 'OFW — Ship Captain',
      industry: 'Maritime',
      email: 'dilagan@prospects.local',
      mobile_phone: '09201234007',
      country_code: '+63',
      source: 'CAMPAIGN' as const,
      source_campaign_id: cmp4Id,
      lead_status: 'NEW' as const,
      assigned_rm_id: rmId3,
      client_category: 'RETAIL',
      estimated_aum: '8000000',
      aum_currency: 'PHP',
      risk_profile: 'CONSERVATIVE' as const,
      product_interest: JSON.stringify(['UITF', 'BONDS']),
      notes: 'Based in Davao. OFW remittances invested via spouse. Interested in UITF for college fund.',
      marketing_consent: true,
      marketing_consent_date: daysAgo(3),
      politically_exposed: false,
      created_by_user_id: rmId3,
    },
    {
      lead_code: 'LEAD-008',
      entity_type: 'NON_INDIVIDUAL' as const,
      entity_name: 'Luzon Infrastructure Holdings Inc.',
      company_name: 'Luzon Infrastructure Holdings Inc.',
      first_name: 'Grace',  // Treasurer
      last_name: 'Villanueva-Uy',
      email: 'gvillanueva@lih.local',
      mobile_phone: '09321234008',
      country_code: '+63',
      source: 'MANUAL' as const,
      lead_status: 'NOT_INTERESTED' as const,
      assigned_rm_id: rmId2,
      client_category: 'CORPORATE',
      estimated_aum: '500000000',
      aum_currency: 'PHP',
      risk_profile: 'GROWTH' as const,
      product_interest: JSON.stringify(['IMA_DIRECTED']),
      notes: 'Declined due to current fund lock-up. To re-engage in Q3 2026 when SPV matures.',
      marketing_consent: false,
      politically_exposed: false,
      drop_reason: 'EXISTING_ARRANGEMENT',
      created_by_user_id: rmId2,
    },
  ];

  const ids: Record<string, number> = {};
  for (const r of rows) {
    const ex = await db.select().from(schema.leads)
      .where(eq(schema.leads.lead_code, r.lead_code)).limit(1);
    if (ex.length) { ids[r.lead_code] = ex[0].id; continue; }
    const [ins] = await db.insert(schema.leads).values(r as any).returning({ id: schema.leads.id });
    ids[r.lead_code] = ins.id;
  }

  console.log(`  → ${Object.keys(ids).length} leads seeded`);
  return ids;
}

// ─── 5. lead enrichment ──────────────────────────────────────────────────────

async function seedLeadEnrichment(leadIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[5] Seeding lead enrichment (family, addresses, IDs, lifestyle)...');
  let count = 0;

  // Lead Family Members
  const familyRows = [
    { lead_id: leadIds['LEAD-001'], relationship: 'Spouse', first_name: 'Lourdes', last_name: 'Villanueva', date_of_birth: '1977-06-20', occupation: 'Homemaker', contact_number: '09171230001', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-001'], relationship: 'Son', first_name: 'Rafael', last_name: 'Villanueva', date_of_birth: '2002-01-15', occupation: 'Student', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-002'], relationship: 'Son', first_name: 'Miguel', last_name: 'Mañalac', date_of_birth: '1995-08-10', occupation: 'Architect', contact_number: '09189870002', created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-005'], relationship: 'Mother', first_name: 'Natividad', last_name: 'Santos', date_of_birth: '1955-03-28', occupation: 'Retired', created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-006'], relationship: 'Spouse', first_name: 'Leticia', last_name: 'Reyes', date_of_birth: '1967-11-05', occupation: 'Dentist', contact_number: '09189876060', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-006'], relationship: 'Daughter', first_name: 'Bianca', last_name: 'Reyes', date_of_birth: '1998-04-22', occupation: 'Medical Student', created_by_user_id: userIds['rm_2'] ?? 2 },
  ];
  for (const r of familyRows) {
    if (!r.lead_id) continue;
    await db.insert(schema.leadFamilyMembers).values(r as any);
    count++;
  }

  // Lead Addresses
  const addressRows = [
    { lead_id: leadIds['LEAD-001'], address_type: 'RESIDENTIAL', address_line_1: 'Unit 4B, The Residences at Greenbelt', city: 'Makati', state_province: 'Metro Manila', postal_code: '1224', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-001'], address_type: 'BUSINESS', address_line_1: '3/F Villanueva Properties Bldg., 25 Ayala Ave.', city: 'Makati', state_province: 'Metro Manila', postal_code: '1226', country: 'Philippines', is_primary: false, created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-002'], address_type: 'RESIDENTIAL', address_line_1: '18 Corinthian Gardens, Quezon City', city: 'Quezon City', state_province: 'Metro Manila', postal_code: '1108', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-005'], address_type: 'RESIDENTIAL', address_line_1: 'Unit 2201, Pacific Plaza Towers, BGC', city: 'Taguig', state_province: 'Metro Manila', postal_code: '1634', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-006'], address_type: 'RESIDENTIAL', address_line_1: '50 Polo Club Drive, Forbes Park', city: 'Makati', state_province: 'Metro Manila', postal_code: '1210', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-007'], address_type: 'RESIDENTIAL', address_line_1: 'Brgy. Buhangin, Davao City', city: 'Davao City', state_province: 'Davao del Sur', postal_code: '8000', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_3'] ?? 3 },
  ];
  for (const r of addressRows) {
    if (!r.lead_id) continue;
    await db.insert(schema.leadAddresses).values(r as any);
    count++;
  }

  // Lead Identifications
  const idRows = [
    { lead_id: leadIds['LEAD-001'], id_type: 'PASSPORT', id_number: 'P12345678A', issue_date: '2022-03-01', expiry_date: '2032-03-01', issuing_authority: 'DFA', issuing_country: 'Philippines', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-001'], id_type: 'TIN', id_number: '123-456-789-000', issuing_authority: 'BIR', issuing_country: 'Philippines', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-002'], id_type: 'PHILSYS', id_number: 'PSA-2024-MANALAC-001', issue_date: '2024-01-15', expiry_date: '2034-01-15', issuing_authority: 'PSA', issuing_country: 'Philippines', created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-005'], id_type: 'IBP_ID', id_number: 'IBP-2025-SANTOS-777', issue_date: '2025-02-01', expiry_date: '2027-02-01', issuing_authority: 'IBP', issuing_country: 'Philippines', created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-006'], id_type: 'PRC_ID', id_number: 'PRC-MD-0098765', issue_date: '2023-11-10', expiry_date: '2025-11-10', issuing_authority: 'PRC', issuing_country: 'Philippines', created_by_user_id: userIds['rm_2'] ?? 2 },
  ];
  for (const r of idRows) {
    if (!r.lead_id) continue;
    await db.insert(schema.leadIdentifications).values(r as any);
    count++;
  }

  // Lead Lifestyle
  const lifestyleRows = [
    { lead_id: leadIds['LEAD-001'], hobbies: JSON.stringify(['Golf', 'Art Collecting']), cuisine_preferences: JSON.stringify(['Japanese', 'Italian']), sports: JSON.stringify(['Golf', 'Swimming']), clubs_memberships: JSON.stringify(['Wack Wack Golf Club', 'Makati Business Club']), communication_preference: 'EMAIL', created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-002'], hobbies: JSON.stringify(['Reading', 'Gardening', 'Classical Music']), cuisine_preferences: JSON.stringify(['Filipino', 'French']), clubs_memberships: JSON.stringify(['Filipinas Heritage Library']), special_dates: JSON.stringify([{ occasion: 'Birthday', date: '11-25' }, { occasion: 'Anniversary', date: '06-18' }]), communication_preference: 'PHONE', created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-006'], hobbies: JSON.stringify(['Triathlon', 'Photography']), cuisine_preferences: JSON.stringify(['Korean', 'Filipino', 'Mediterranean']), sports: JSON.stringify(['Triathlon', 'Tennis']), clubs_memberships: JSON.stringify(['Manila Doctors\' Club', 'RCBC Polo Club']), communication_preference: 'EMAIL', created_by_user_id: userIds['rm_2'] ?? 2 },
  ];
  for (const r of lifestyleRows) {
    if (!r.lead_id) continue;
    await db.insert(schema.leadLifestyle).values(r as any);
    count++;
  }

  console.log(`  → ${count} lead enrichment records seeded`);
}

// ─── 6. lead_list_members ────────────────────────────────────────────────────

async function seedLeadListMembers(leadIds: Record<string, number>, listIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[6] Seeding lead_list_members...');

  const rows = [
    { lead_list_id: listIds['LL-2026-001'], lead_id: leadIds['LEAD-001'], added_by: 'SYSTEM', added_at: daysAgo(20) },
    { lead_list_id: listIds['LL-2026-001'], lead_id: leadIds['LEAD-002'], added_by: 'SYSTEM', added_at: daysAgo(20) },
    { lead_list_id: listIds['LL-2026-001'], lead_id: leadIds['LEAD-006'], added_by: 'SYSTEM', added_at: daysAgo(7) },
    { lead_list_id: listIds['LL-2026-002'], lead_id: leadIds['LEAD-001'], added_by: String(userIds['rm_2']), added_at: daysAgo(14) },
    { lead_list_id: listIds['LL-2026-002'], lead_id: leadIds['LEAD-002'], added_by: String(userIds['rm_1']), added_at: daysAgo(14) },
    { lead_list_id: listIds['LL-2026-002'], lead_id: leadIds['LEAD-006'], added_by: String(userIds['rm_2']), added_at: daysAgo(12) },
    { lead_list_id: listIds['LL-2026-003'], lead_id: leadIds['LEAD-003'], added_by: 'SYSTEM', added_at: daysAgo(65) },
    { lead_list_id: listIds['LL-2026-003'], lead_id: leadIds['LEAD-005'], added_by: 'SYSTEM', added_at: daysAgo(8) },
    { lead_list_id: listIds['LL-2026-004'], lead_id: leadIds['LEAD-004'], added_by: String(userIds['rm_3']), added_at: daysAgo(2) },
    { lead_list_id: listIds['LL-2026-004'], lead_id: leadIds['LEAD-007'], added_by: String(userIds['rm_3']), added_at: daysAgo(2) },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.lead_id || !r.lead_list_id) continue;
    await db.insert(schema.leadListMembers).values(r as any);
    count++;
  }

  console.log(`  → ${count} lead list members seeded`);
  // Return IDs for campaign_responses FK
  const insertedMembers = await db.select().from(schema.leadListMembers).limit(100);
  const memberMap: Record<string, number> = {};
  for (const m of insertedMembers) {
    memberMap[`${m.lead_list_id}:${m.lead_id}`] = m.id;
  }
  return memberMap;
}

// ─── 7. campaign_lists ───────────────────────────────────────────────────────

async function seedCampaignLists(campaignIds: Record<string, number>, listIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[7] Seeding campaign_lists...');

  const rows = [
    { campaign_id: campaignIds['CMP-2026-001'], lead_list_id: listIds['LL-2026-003'], assigned_by: String(userIds['rm_1']), assigned_at: daysAgo(95) },
    { campaign_id: campaignIds['CMP-2026-002'], lead_list_id: listIds['LL-2026-001'], assigned_by: String(userIds['rm_2']), assigned_at: daysAgo(18) },
    { campaign_id: campaignIds['CMP-2026-002'], lead_list_id: listIds['LL-2026-002'], assigned_by: String(userIds['rm_2']), assigned_at: daysAgo(18) },
    { campaign_id: campaignIds['CMP-2026-003'], lead_list_id: listIds['LL-2026-001'], assigned_by: String(userIds['rm_1']), assigned_at: daysAgo(8) },
    { campaign_id: campaignIds['CMP-2026-004'], lead_list_id: listIds['LL-2026-004'], assigned_by: String(userIds['rm_3']), assigned_at: daysAgo(1) },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.campaign_id || !r.lead_list_id) continue;
    await db.insert(schema.campaignLists).values(r as any);
    count++;
  }

  console.log(`  → ${count} campaign lists seeded`);
}

// ─── 8. campaign_responses ───────────────────────────────────────────────────

async function seedCampaignResponses(campaignIds: Record<string, number>, leadIds: Record<string, number>, listMemberMap: Record<string, number>, listIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[8] Seeding campaign_responses...');

  const rows = [
    {
      campaign_id: campaignIds['CMP-2026-001'],
      lead_id: leadIds['LEAD-003'],
      response_type: 'CONVERTED' as const,
      response_notes: 'Lead agreed to UITF top-up of PHP 5M. Converted to prospect.',
      response_date: daysAgo(55),
      response_channel: 'EMAIL',
      assigned_rm_id: userIds['rm_1'],
      follow_up_required: false,
      follow_up_completed: true,
      list_member_id: listMemberMap[`${listIds['LL-2026-003']}:${leadIds['LEAD-003']}`],
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      campaign_id: campaignIds['CMP-2026-001'],
      lead_id: leadIds['LEAD-005'],
      response_type: 'INTERESTED' as const,
      response_notes: 'Interested in UITF but wants to review prospectus first.',
      response_date: daysAgo(10),
      response_channel: 'EMAIL',
      assigned_rm_id: userIds['rm_1'],
      follow_up_required: true,
      follow_up_date: dateStr(daysFromNow(5)),
      follow_up_completed: false,
      follow_up_action: 'Send UITF prospectus and schedule meeting',
      list_member_id: listMemberMap[`${listIds['LL-2026-003']}:${leadIds['LEAD-005']}`],
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      campaign_id: campaignIds['CMP-2026-002'],
      lead_id: leadIds['LEAD-001'],
      response_type: 'INTERESTED' as const,
      response_notes: 'Very interested in ROP bonds. Requested detailed term sheet and yield computation.',
      response_date: daysAgo(12),
      response_channel: 'EMAIL',
      assigned_rm_id: userIds['rm_2'],
      follow_up_required: true,
      follow_up_date: dateStr(daysAgo(8)),
      follow_up_completed: true,
      follow_up_action: 'Send term sheet via email — done',
      list_member_id: listMemberMap[`${listIds['LL-2026-002']}:${leadIds['LEAD-001']}`],
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      campaign_id: campaignIds['CMP-2026-002'],
      lead_id: leadIds['LEAD-006'],
      response_type: 'CALLBACK_REQUESTED' as const,
      response_notes: 'Currently abroad, requested callback upon return next week.',
      response_date: daysAgo(10),
      response_channel: 'EMAIL',
      assigned_rm_id: userIds['rm_2'],
      follow_up_required: true,
      follow_up_date: dateStr(daysFromNow(4)),
      follow_up_completed: false,
      list_member_id: listMemberMap[`${listIds['LL-2026-002']}:${leadIds['LEAD-006']}`],
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      campaign_id: campaignIds['CMP-2026-003'],
      lead_id: leadIds['LEAD-002'],
      response_type: 'INTERESTED' as const,
      response_notes: 'Confirmed availability for portfolio review meeting on April 30.',
      response_date: daysAgo(4),
      response_channel: 'EMAIL',
      assigned_rm_id: userIds['rm_1'],
      follow_up_required: true,
      follow_up_date: dateStr(daysFromNow(3)),
      follow_up_completed: false,
      follow_up_action: 'Confirm meeting and send calendar invite',
      list_member_id: listMemberMap[`${listIds['LL-2026-001']}:${leadIds['LEAD-002']}`],
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.campaign_id || !r.lead_id) continue;
    await db.insert(schema.campaignResponses).values(r as any).onConflictDoNothing();
    count++;
  }

  console.log(`  → ${count} campaign responses seeded`);
}

// ─── 9. campaign_communications ──────────────────────────────────────────────

async function seedCampaignCommunications(campaignIds: Record<string, number>, listIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[9] Seeding campaign_communications...');

  const rows = [
    {
      campaign_id: campaignIds['CMP-2026-001'],
      channel: 'EMAIL' as const,
      subject: 'Grow Your UITF Portfolio — Exclusive Top-Up Offer',
      body: 'Dear Valued Investor, we invite you to take advantage of our UITF top-up promotion. Minimum top-up of PHP 100,000 with waived transaction fees. Offer valid until March 31, 2026.',
      recipient_list_id: listIds['LL-2026-003'],
      scheduled_at: daysAgo(89),
      dispatched_at: daysAgo(89),
      dispatch_status: 'COMPLETED' as const,
      total_recipients: 112,
      delivered_count: 108,
      bounced_count: 4,
      retry_count: 0,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      campaign_id: campaignIds['CMP-2026-002'],
      channel: 'EMAIL' as const,
      subject: 'Exclusive Invitation: ROP Government Bond — 6.5% p.a.',
      body: 'Dear Client, we are pleased to offer you priority access to the latest Republic of the Philippines bond issuance. Tenor: 5 years, Rate: 6.5% p.a., Minimum: PHP 500,000. Offer closes April 30, 2026.',
      recipient_list_id: listIds['LL-2026-001'],
      scheduled_at: daysAgo(14),
      dispatched_at: daysAgo(14),
      dispatch_status: 'COMPLETED' as const,
      total_recipients: 47,
      delivered_count: 46,
      bounced_count: 1,
      retry_count: 0,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      campaign_id: campaignIds['CMP-2026-002'],
      channel: 'EMAIL' as const,
      subject: 'Last Call: ROP Bond Offer Closes April 30',
      body: 'Dear Client, this is a reminder that our exclusive ROP Bond offering closes on April 30. Please contact your RM to secure your allocation.',
      recipient_list_id: listIds['LL-2026-002'],
      scheduled_at: daysAgo(2),
      dispatched_at: daysAgo(2),
      dispatch_status: 'COMPLETED' as const,
      total_recipients: 23,
      delivered_count: 23,
      bounced_count: 0,
      retry_count: 0,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      campaign_id: campaignIds['CMP-2026-003'],
      channel: 'EMAIL' as const,
      subject: 'Your Annual Portfolio Review — Let\'s Connect',
      body: 'Dear Client, as part of our commitment to your financial goals, we\'d like to schedule your annual portfolio review. Please reply or contact your RM to set an appointment.',
      recipient_list_id: listIds['LL-2026-001'],
      scheduled_at: daysAgo(5),
      dispatched_at: daysAgo(5),
      dispatch_status: 'COMPLETED' as const,
      total_recipients: 47,
      delivered_count: 47,
      bounced_count: 0,
      retry_count: 0,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      campaign_id: campaignIds['CMP-2026-004'],
      channel: 'EMAIL' as const,
      subject: 'Experience Personalized Trust Banking — ABC Bank',
      body: 'We are pleased to introduce you to ABC Bank\'s Trust Banking services. Our team of experts is ready to help you achieve your financial goals.',
      recipient_list_id: listIds['LL-2026-004'],
      scheduled_at: daysFromNow(10),
      dispatch_status: 'PENDING' as const,
      total_recipients: 18,
      delivered_count: 0,
      bounced_count: 0,
      retry_count: 0,
      created_by_user_id: userIds['rm_3'] ?? 3,
    },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.campaign_id) continue;
    await db.insert(schema.campaignCommunications).values(r as any);
    count++;
  }

  console.log(`  → ${count} campaign communications seeded`);
}

// ─── 10. prospects ───────────────────────────────────────────────────────────

async function seedProspects(leadIds: Record<string, number>, campaignIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[10] Seeding prospects...');

  const rmId1 = userIds['rm_1'] ?? 1;
  const rmId2 = userIds['rm_2'] ?? 2;
  const rmId3 = userIds['rm_3'] ?? 3;

  const rows = [
    {
      prospect_code: 'PROSP-001',
      lead_id: leadIds['LEAD-003'],  // Converted from Ferdinand Casimiro
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Engr.',
      first_name: 'Ferdinand',
      last_name: 'Casimiro',
      date_of_birth: '1982-07-08',
      gender: 'M',
      nationality: 'Filipino',
      email: 'fcasimiro@prospects.local',
      mobile_phone: '09201234003',
      country_code: '+63',
      annual_income: 8_000_000,
      net_worth: 30_000_000,
      total_aum: 22_000_000,
      risk_profile: 'MODERATE' as const,
      investment_horizon: '5-10 years',
      product_interests: JSON.stringify(['UITF', 'IMA_DISCRETIONARY']),
      client_category: 'HNW',
      marital_status: 'Married',
      country_of_residence: 'Philippines',
      occupation: 'Civil Engineer',
      company_name: 'FCC Engineering Consultants Inc.',
      designation: 'Principal Engineer',
      aum_currency: 'PHP',
      prospect_status: 'ACTIVE' as const,
      assigned_rm_id: rmId1,
      source_campaign_id: campaignIds['CMP-2026-001'],
      source_lead_id: leadIds['LEAD-003'],
      negative_list_cleared: true,
      negative_list_checked_at: daysAgo(50),
      ageing_days: 55,
      marketing_consent: true,
      marketing_consent_date: daysAgo(55),
      created_by_user_id: rmId1,
    },
    {
      prospect_code: 'PROSP-002',
      lead_id: leadIds['LEAD-001'],  // Ramon Villanueva - in QUALIFIED stage
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Mr.',
      first_name: 'Ramon',
      last_name: 'Villanueva',
      date_of_birth: '1975-03-14',
      gender: 'M',
      nationality: 'Filipino',
      email: 'rvillanueva@prospects.local',
      mobile_phone: '09171234001',
      country_code: '+63',
      annual_income: 12_000_000,
      net_worth: 65_000_000,
      total_aum: 45_000_000,
      risk_profile: 'MODERATE' as const,
      investment_horizon: '7-10 years',
      product_interests: JSON.stringify(['BONDS', 'IMA_DIRECTED', 'UITF']),
      client_category: 'HNW',
      marital_status: 'Married',
      country_of_residence: 'Philippines',
      occupation: 'Business Owner',
      company_name: 'Villanueva Properties Inc.',
      designation: 'President & CEO',
      aum_currency: 'PHP',
      prospect_status: 'ACTIVE' as const,
      assigned_rm_id: rmId2,
      source_campaign_id: campaignIds['CMP-2026-002'],
      source_lead_id: leadIds['LEAD-001'],
      negative_list_cleared: true,
      negative_list_checked_at: daysAgo(15),
      ageing_days: 20,
      marketing_consent: true,
      marketing_consent_date: daysAgo(20),
      referral_type: 'CLIENT',
      referral_id: 'CLT-001',
      created_by_user_id: rmId2,
    },
    {
      prospect_code: 'PROSP-003',
      entity_type: 'INDIVIDUAL' as const,
      salutation: 'Ms.',
      first_name: 'Natividad',
      last_name: 'Escudero-Lim',
      date_of_birth: '1972-02-14',
      gender: 'F',
      nationality: 'Filipino',
      email: 'neslim@prospects.local',
      mobile_phone: '09189876003',
      country_code: '+63',
      annual_income: 15_000_000,
      net_worth: 90_000_000,
      total_aum: 70_000_000,
      risk_profile: 'GROWTH' as const,
      investment_horizon: '10+ years',
      product_interests: JSON.stringify(['IMA_DISCRETIONARY', 'UITF', 'BONDS']),
      client_category: 'HNW',
      marital_status: 'Married',
      country_of_residence: 'Philippines',
      occupation: 'CFO',
      company_name: 'Lim Family Holdings Inc.',
      designation: 'Chief Financial Officer',
      aum_currency: 'PHP',
      prospect_status: 'RECOMMENDED' as const,
      assigned_rm_id: rmId1,
      negative_list_cleared: true,
      negative_list_checked_at: daysAgo(30),
      ageing_days: 30,
      marketing_consent: true,
      marketing_consent_date: daysAgo(30),
      referral_type: 'INTERNAL',
      referral_id: String(userIds['branch_head'] ?? 0),
      created_by_user_id: rmId1,
    },
    {
      prospect_code: 'PROSP-004',
      entity_type: 'NON_INDIVIDUAL' as const,
      first_name: 'Rolando',  // Authorized rep
      last_name: 'Gutierrez',
      entity_name: 'Visayas Agritech Corporation',
      company_name: 'Visayas Agritech Corporation',
      email: 'rgutierrez@visayasagritech.local',
      mobile_phone: '09321234004',
      country_code: '+63',
      net_worth: 200_000_000,
      total_aum: 80_000_000,
      risk_profile: 'MODERATE' as const,
      investment_horizon: '3-5 years',
      product_interests: JSON.stringify(['IMA_DIRECTED', 'ESCROW']),
      client_category: 'CORPORATE',
      aum_currency: 'PHP',
      prospect_status: 'ACTIVE' as const,
      assigned_rm_id: rmId3,
      source_lead_id: leadIds['LEAD-004'],
      negative_list_cleared: false,
      ageing_days: 3,
      marketing_consent: false,
      created_by_user_id: rmId3,
    },
  ];

  const ids: Record<string, number> = {};
  for (const r of rows) {
    const ex = await db.select().from(schema.prospects)
      .where(eq(schema.prospects.prospect_code, r.prospect_code)).limit(1);
    if (ex.length) { ids[r.prospect_code] = ex[0].id; continue; }
    const [ins] = await db.insert(schema.prospects).values(r as any).returning({ id: schema.prospects.id });
    ids[r.prospect_code] = ins.id;
  }

  console.log(`  → ${Object.keys(ids).length} prospects seeded`);
  return ids;
}

// ─── 11. prospect enrichment ─────────────────────────────────────────────────

async function seedProspectEnrichment(prospectIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[11] Seeding prospect enrichment...');
  let count = 0;

  // Prospect Family Members
  const familyRows = [
    { prospect_id: prospectIds['PROSP-001'], relationship: 'Spouse', first_name: 'Josefina', last_name: 'Casimiro', date_of_birth: '1984-05-10', occupation: 'Interior Designer', contact_number: '09201234099', created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-002'], relationship: 'Spouse', first_name: 'Lourdes', last_name: 'Villanueva', date_of_birth: '1977-06-20', occupation: 'Homemaker', created_by_user_id: userIds['rm_2'] ?? 2 },
    { prospect_id: prospectIds['PROSP-003'], relationship: 'Spouse', first_name: 'Renato', last_name: 'Lim', date_of_birth: '1970-08-15', occupation: 'Business Owner', contact_number: '09189876030', created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-003'], relationship: 'Son', first_name: 'Carlo', last_name: 'Lim', date_of_birth: '1998-01-22', occupation: 'Student', created_by_user_id: userIds['rm_1'] ?? 1 },
  ];
  for (const r of familyRows) {
    if (!r.prospect_id) continue;
    await db.insert(schema.prospectFamilyMembers).values(r as any);
    count++;
  }

  // Prospect Addresses
  const addressRows = [
    { prospect_id: prospectIds['PROSP-001'], address_type: 'RESIDENTIAL', address_line_1: '12 Tindalo Street, BF Homes', city: 'Parañaque', state_province: 'Metro Manila', postal_code: '1720', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-002'], address_type: 'RESIDENTIAL', address_line_1: 'Unit 4B, The Residences at Greenbelt', city: 'Makati', state_province: 'Metro Manila', postal_code: '1224', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_2'] ?? 2 },
    { prospect_id: prospectIds['PROSP-003'], address_type: 'RESIDENTIAL', address_line_1: '8 Polaris Street, Bel-Air Village', city: 'Makati', state_province: 'Metro Manila', postal_code: '1209', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-004'], address_type: 'BUSINESS', address_line_1: '3F Ayala Business Park, Cebu Business Park', city: 'Cebu City', state_province: 'Cebu', postal_code: '6000', country: 'Philippines', is_primary: true, created_by_user_id: userIds['rm_3'] ?? 3 },
  ];
  for (const r of addressRows) {
    if (!r.prospect_id) continue;
    await db.insert(schema.prospectAddresses).values(r as any);
    count++;
  }

  // Prospect Identifications
  const idRows = [
    { prospect_id: prospectIds['PROSP-001'], id_type: 'PASSPORT', id_number: 'P87654321B', issue_date: '2021-07-01', expiry_date: '2031-07-01', issuing_authority: 'DFA', issuing_country: 'Philippines', created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-002'], id_type: 'PASSPORT', id_number: 'P12345678A', issue_date: '2022-03-01', expiry_date: '2032-03-01', issuing_authority: 'DFA', issuing_country: 'Philippines', created_by_user_id: userIds['rm_2'] ?? 2 },
    { prospect_id: prospectIds['PROSP-003'], id_type: 'PHILSYS', id_number: 'PSA-2024-LIM-001', issue_date: '2024-06-01', expiry_date: '2034-06-01', issuing_authority: 'PSA', issuing_country: 'Philippines', created_by_user_id: userIds['rm_1'] ?? 1 },
  ];
  for (const r of idRows) {
    if (!r.prospect_id) continue;
    await db.insert(schema.prospectIdentifications).values(r as any);
    count++;
  }

  // Prospect Lifestyle
  const lifestyleRows = [
    { prospect_id: prospectIds['PROSP-002'], hobbies: JSON.stringify(['Golf', 'Art Collecting', 'Real Estate Development']), cuisine_preferences: JSON.stringify(['Japanese', 'Italian']), sports: JSON.stringify(['Golf']), clubs_memberships: JSON.stringify(['Wack Wack Golf Club', 'Makati Business Club']), communication_preference: 'EMAIL', created_by_user_id: userIds['rm_2'] ?? 2 },
    { prospect_id: prospectIds['PROSP-003'], hobbies: JSON.stringify(['Pilates', 'Fine Dining', 'Interior Design']), cuisine_preferences: JSON.stringify(['French', 'Japanese', 'Filipino']), clubs_memberships: JSON.stringify(['Rockwell Club', 'Makati City Club']), special_dates: JSON.stringify([{ occasion: 'Birthday', date: '02-14' }]), communication_preference: 'PHONE', created_by_user_id: userIds['rm_1'] ?? 1 },
  ];
  for (const r of lifestyleRows) {
    if (!r.prospect_id) continue;
    await db.insert(schema.prospectLifestyle).values(r as any);
    count++;
  }

  console.log(`  → ${count} prospect enrichment records seeded`);
}

// ─── 12. campaign_consent_log ────────────────────────────────────────────────

async function seedConsentLog(leadIds: Record<string, number>, prospectIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[12] Seeding campaign_consent_log...');

  const rows = [
    { lead_id: leadIds['LEAD-001'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'RM_ON_BEHALF' as const, consent_text: 'Client agreed to receive marketing emails during initial meeting.', effective_date: dateStr(daysAgo(20)), created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-001'], consent_type: 'MARKETING_SMS' as const, consent_status: 'OPTED_OUT' as const, consent_source: 'PORTAL_SELF_SERVICE' as const, consent_text: 'Client opted out of SMS via client portal.', effective_date: dateStr(daysAgo(10)), created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-002'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'RM_ON_BEHALF' as const, effective_date: dateStr(daysAgo(45)), created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-003'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'ONBOARDING' as const, effective_date: dateStr(daysAgo(60)), created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-005'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'RM_ON_BEHALF' as const, effective_date: dateStr(daysAgo(10)), created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-005'], consent_type: 'PUSH_NOTIFICATION' as const, consent_status: 'OPTED_IN' as const, consent_source: 'PORTAL_SELF_SERVICE' as const, effective_date: dateStr(daysAgo(9)), created_by_user_id: userIds['rm_1'] ?? 1 },
    { lead_id: leadIds['LEAD-006'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'RM_ON_BEHALF' as const, effective_date: dateStr(daysAgo(8)), created_by_user_id: userIds['rm_2'] ?? 2 },
    { lead_id: leadIds['LEAD-007'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'ONBOARDING' as const, effective_date: dateStr(daysAgo(3)), created_by_user_id: userIds['rm_3'] ?? 3 },
    { prospect_id: prospectIds['PROSP-001'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'ONBOARDING' as const, effective_date: dateStr(daysAgo(50)), created_by_user_id: userIds['rm_1'] ?? 1 },
    { prospect_id: prospectIds['PROSP-002'], consent_type: 'MARKETING_EMAIL' as const, consent_status: 'OPTED_IN' as const, consent_source: 'RM_ON_BEHALF' as const, effective_date: dateStr(daysAgo(18)), created_by_user_id: userIds['rm_2'] ?? 2 },
    { prospect_id: prospectIds['PROSP-003'], consent_type: 'EVENT_INVITATION' as const, consent_status: 'OPTED_IN' as const, consent_source: 'ONBOARDING' as const, effective_date: dateStr(daysAgo(30)), created_by_user_id: userIds['rm_1'] ?? 1 },
  ];

  let count = 0;
  for (const r of rows) {
    await db.insert(schema.campaignConsentLog).values(r as any);
    count++;
  }

  console.log(`  → ${count} consent log entries seeded`);
}

// ─── 13. meeting_invitees ────────────────────────────────────────────────────

async function seedMeetingInvitees(meetingIds: Record<string, number>, leadIds: Record<string, number>, prospectIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[13] Seeding meeting_invitees...');

  const rows = [
    // MTG-001: Annual Portfolio Review — Eduardo Tan (COMPLETED)
    { meeting_id: meetingIds['MTG-001'], user_id: userIds['checker_1'], rsvp_status: 'ACCEPTED' as const, is_required: false, attended: true, created_by_user_id: userIds['rm_1'] ?? 1 },
    // MTG-002: Onboarding — Carlos Bautista (COMPLETED)
    { meeting_id: meetingIds['MTG-002'], user_id: userIds['trust_officer_3'], rsvp_status: 'ACCEPTED' as const, is_required: true, attended: true, created_by_user_id: userIds['rm_3'] ?? 3 },
    // MTG-003: Quarterly Update — Pagkakaisa Holdings (COMPLETED)
    { meeting_id: meetingIds['MTG-003'], user_id: userIds['portfolio_mgr'], rsvp_status: 'ACCEPTED' as const, is_required: false, attended: false, created_by_user_id: userIds['rm_1'] ?? 1 },
    // MTG-004: Portfolio Review — Maria Reyes-Lopez (SCHEDULED)
    { meeting_id: meetingIds['MTG-004'], user_id: userIds['portfolio_mgr'], rsvp_status: 'ACCEPTED' as const, is_required: false, attended: false, created_by_user_id: userIds['rm_1'] ?? 1 },
    // MTG-005: Investment Proposal — Mindanao Dev Authority (SCHEDULED)
    { meeting_id: meetingIds['MTG-005'], user_id: userIds['trust_officer_2'], rsvp_status: 'PENDING' as const, is_required: true, attended: false, created_by_user_id: userIds['rm_2'] ?? 2 },
    { meeting_id: meetingIds['MTG-005'], user_id: userIds['portfolio_mgr'], rsvp_status: 'ACCEPTED' as const, is_required: false, attended: false, created_by_user_id: userIds['rm_2'] ?? 2 },
    // Lead invitees for prospect meetings
    { meeting_id: meetingIds['MTG-004'], lead_id: leadIds['LEAD-002'], rsvp_status: 'ACCEPTED' as const, is_required: true, attended: false, created_by_user_id: userIds['rm_1'] ?? 1 },
    { meeting_id: meetingIds['MTG-005'], prospect_id: prospectIds['PROSP-004'], rsvp_status: 'PENDING' as const, is_required: true, attended: false, created_by_user_id: userIds['rm_2'] ?? 2 },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.meeting_id) continue;
    await db.insert(schema.meetingInvitees).values(r as any);
    count++;
  }

  console.log(`  → ${count} meeting invitees seeded`);
}

// ─── 14. call_report_feedback ────────────────────────────────────────────────

async function seedCallReportFeedback(crIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[14] Seeding call_report_feedback...');

  const rows = [
    {
      call_report_id: crIds['CR-001'],
      feedback_by: userIds['checker_1'] ?? 5,
      feedback_type: 'COACHING',
      comment: 'Good capture of client objectives. Consider documenting specific rebalancing percentages discussed (MER → 5%). Ensure follow-up on PHP 20M top-up opportunity in next meeting.',
      sentiment: 'POSITIVE' as const,
      is_private: false,
      source: 'CALENDAR',
    },
    {
      call_report_id: crIds['CR-002'],
      feedback_by: userIds['branch_head'] ?? 6,
      feedback_type: 'COMPLIANCE',
      comment: 'Report is complete. Verify KYC submission to compliance within 5 business days per BSP Circular 1022 requirements.',
      sentiment: 'NEUTRAL' as const,
      is_private: false,
      source: 'CALENDAR',
    },
    {
      call_report_id: crIds['CR-003'],
      feedback_by: userIds['checker_1'] ?? 5,
      feedback_type: 'GENERAL',
      comment: 'Report still in DRAFT. Please submit for approval within 48 hours per policy. Outcome section needs more detail on bond term sheet timeline.',
      sentiment: 'NEUTRAL' as const,
      is_private: true,
      source: 'CALENDAR',
    },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.call_report_id) continue;
    await db.insert(schema.callReportFeedback).values(r as any);
    count++;
  }

  console.log(`  → ${count} call report feedback records seeded`);
}

// ─── 15. call_report_approvals ───────────────────────────────────────────────

async function seedCallReportApprovals(crIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[15] Seeding call_report_approvals...');

  const rows = [
    {
      call_report_id: crIds['CR-001'],
      supervisor_id: userIds['checker_1'] ?? 5,
      action: 'APPROVED' as const,
      claimed_at: daysAgo(12),
      decided_at: daysAgo(12),
      reviewer_comments: 'Complete and accurate report. Approved for submission.',
      created_by_user_id: userIds['checker_1'] ?? 5,
    },
    {
      call_report_id: crIds['CR-002'],
      supervisor_id: userIds['branch_head'] ?? 6,
      action: 'APPROVED' as const,
      claimed_at: daysAgo(28),
      decided_at: daysAgo(28),
      reviewer_comments: 'Onboarding meeting well documented. Client files complete.',
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      call_report_id: crIds['CR-003'],
      supervisor_id: userIds['checker_1'] ?? 5,
      action: 'PENDING' as const,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
  ];

  let count = 0;
  for (const r of rows) {
    if (!r.call_report_id) continue;
    await db.insert(schema.callReportApprovals).values(r as any);
    count++;
  }

  console.log(`  → ${count} call report approvals seeded`);
}

// ─── 16. opportunities (extended) ────────────────────────────────────────────

async function seedOpportunitiesExtended(leadIds: Record<string, number>, prospectIds: Record<string, number>, campaignIds: Record<string, number>, crIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[16] Seeding opportunities (extended with lead/prospect links)...');

  const rows = [
    {
      opportunity_code: 'OPP-005',
      name: 'Ramon Villanueva — ROP Bond Subscription PHP 15M',
      lead_id: leadIds['LEAD-001'],
      prospect_id: prospectIds['PROSP-002'],
      campaign_id: campaignIds['CMP-2026-002'],
      product_type: 'BONDS',
      pipeline_value: '15000000',
      pipeline_currency: 'PHP',
      probability: 75,
      stage: 'PROPOSAL' as const,
      expected_close_date: dateStr(daysFromNow(10)),
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      opportunity_code: 'OPP-006',
      name: 'Ferdinand Casimiro — IMA Discretionary PHP 22M',
      lead_id: leadIds['LEAD-003'],
      prospect_id: prospectIds['PROSP-001'],
      campaign_id: campaignIds['CMP-2026-001'],
      product_type: 'IMA_DISCRETIONARY',
      pipeline_value: '22000000',
      pipeline_currency: 'PHP',
      probability: 90,
      stage: 'NEGOTIATION' as const,
      expected_close_date: dateStr(daysFromNow(14)),
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      opportunity_code: 'OPP-007',
      name: 'Natividad Escudero-Lim — IMA Discretionary PHP 70M',
      prospect_id: prospectIds['PROSP-003'],
      product_type: 'IMA_DISCRETIONARY',
      pipeline_value: '70000000',
      pipeline_currency: 'PHP',
      probability: 60,
      stage: 'IDENTIFIED' as const,
      expected_close_date: dateStr(daysFromNow(45)),
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      opportunity_code: 'OPP-008',
      name: 'Dr. Eduardo Reyes — Trust Portfolio PHP 100M',
      lead_id: leadIds['LEAD-006'],
      product_type: 'IMA_DISCRETIONARY',
      pipeline_value: '100000000',
      pipeline_currency: 'PHP',
      probability: 55,
      stage: 'IDENTIFIED' as const,
      expected_close_date: dateStr(daysFromNow(60)),
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      opportunity_code: 'OPP-009',
      name: 'Maribel Santos-Cruz — UITF Subscription PHP 3M',
      lead_id: leadIds['LEAD-005'],
      campaign_id: campaignIds['CMP-2026-001'],
      product_type: 'UITF',
      pipeline_value: '3000000',
      pipeline_currency: 'PHP',
      probability: 70,
      stage: 'PROPOSAL' as const,
      expected_close_date: dateStr(daysFromNow(7)),
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
  ];

  let count = 0;
  for (const r of rows) {
    const ex = await db.select().from(schema.opportunities)
      .where(eq(schema.opportunities.opportunity_code, r.opportunity_code)).limit(1);
    if (ex.length) { count++; continue; }
    await db.insert(schema.opportunities).values(r as any);
    count++;
  }

  console.log(`  → ${count} additional opportunities seeded`);
}

// ─── 17. crm_tasks ───────────────────────────────────────────────────────────

async function seedCrmTasks(leadIds: Record<string, number>, prospectIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[17] Seeding crm_tasks...');

  const rows = [
    {
      task_code: 'TASK-001',
      title: 'Follow up: Ramon Villanueva — ROP Bond Term Sheet',
      description: 'Send detailed term sheet and yield computation. Client responded INTERESTED to CMP-2026-002 email. Call scheduled for May 2.',
      task_type: 'FOLLOW_UP',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(5)),
      assigned_to: userIds['rm_2'] ?? 2,
      assigned_by: userIds['branch_head'] ?? 6,
      related_entity_type: 'lead',
      related_entity_id: leadIds['LEAD-001'],
      task_status: 'IN_PROGRESS' as const,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      task_code: 'TASK-002',
      title: 'Submit CR-003 for Approval — Pagkakaisa Holdings',
      description: 'Call report CR-003 for MTG-003 is still in DRAFT. Submit before 5pm today per BSP 5-day rule.',
      task_type: 'COMPLIANCE',
      priority: 'CRITICAL' as const,
      due_date: dateStr(daysAgo(2)),
      assigned_to: userIds['rm_1'] ?? 1,
      assigned_by: userIds['checker_1'] ?? 5,
      related_entity_type: 'call_report',
      related_entity_id: 3,  // CR-003
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['checker_1'] ?? 5,
    },
    {
      task_code: 'TASK-003',
      title: 'Prepare Rebalancing Proposal — Maria Reyes-Lopez (CLT-002)',
      description: 'Prepare rebalancing proposal reducing equities from 60% to 45% and increasing fixed income allocation ahead of MTG-004.',
      task_type: 'PROPOSAL',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(2)),
      assigned_to: userIds['portfolio_mgr'] ?? 7,
      assigned_by: userIds['rm_1'] ?? 1,
      related_entity_type: 'client',
      task_status: 'IN_PROGRESS' as const,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      task_code: 'TASK-004',
      title: 'KYC Renewal — Eduardo Tan (CLT-001)',
      description: 'Client KYC expires in 30 days. Coordinate with compliance to initiate renewal process and schedule client visit.',
      task_type: 'KYC',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(15)),
      assigned_to: userIds['trust_officer_1'] ?? 3,
      assigned_by: userIds['compliance_officer'] ?? 8,
      related_entity_type: 'client',
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['compliance_officer'] ?? 8,
    },
    {
      task_code: 'TASK-005',
      title: 'Prospect Onboarding — Ferdinand Casimiro (PROSP-001)',
      description: 'Complete CIF opening, KYC submission, and portfolio mandate setup for new IMA Discretionary account.',
      task_type: 'ONBOARDING',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(7)),
      assigned_to: userIds['rm_1'] ?? 1,
      assigned_by: userIds['branch_head'] ?? 6,
      related_entity_type: 'prospect',
      related_entity_id: prospectIds['PROSP-001'],
      task_status: 'IN_PROGRESS' as const,
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      task_code: 'TASK-006',
      title: 'Negative List Check — Visayas Agritech Corp (PROSP-004)',
      description: 'Complete negative list and sanctions screening for corporate prospect before onboarding proceeds.',
      task_type: 'COMPLIANCE',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(3)),
      assigned_to: userIds['compliance_officer'] ?? 8,
      assigned_by: userIds['rm_3'] ?? 3,
      related_entity_type: 'prospect',
      related_entity_id: prospectIds['PROSP-004'],
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['rm_3'] ?? 3,
    },
    {
      task_code: 'TASK-007',
      title: 'Send UITF Prospectus — Atty. Maribel Santos-Cruz (LEAD-005)',
      description: 'Lead requested UITF prospectus after campaign response. Send and follow up in 5 days.',
      task_type: 'FOLLOW_UP',
      priority: 'MEDIUM' as const,
      due_date: dateStr(daysFromNow(1)),
      assigned_to: userIds['rm_1'] ?? 1,
      assigned_by: userIds['rm_1'] ?? 1,
      related_entity_type: 'lead',
      related_entity_id: leadIds['LEAD-005'],
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      task_code: 'TASK-008',
      title: 'Annual Statement Preparation — CLT-003, CLT-004, CLT-008',
      description: 'Prepare and dispatch annual trust statements for Q1 2026 to three clients.',
      task_type: 'REPORTING',
      priority: 'MEDIUM' as const,
      due_date: dateStr(daysFromNow(10)),
      assigned_to: userIds['trust_officer_2'] ?? 4,
      assigned_by: userIds['branch_head'] ?? 6,
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      task_code: 'TASK-009',
      title: 'Call-back: Dr. Eduardo Reyes Jr. (LEAD-006) — Returning May 4',
      description: 'Lead requested callback upon return from abroad. Call Dr. Reyes on May 4 to discuss ROP bond investment.',
      task_type: 'FOLLOW_UP',
      priority: 'HIGH' as const,
      due_date: dateStr(daysFromNow(7)),
      assigned_to: userIds['rm_2'] ?? 2,
      assigned_by: userIds['rm_2'] ?? 2,
      related_entity_type: 'lead',
      related_entity_id: leadIds['LEAD-006'],
      task_status: 'PENDING' as const,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      task_code: 'TASK-010',
      title: 'Prepare Meeting Agenda — MTG-005 Mindanao Dev Authority',
      description: 'Prepare investment proposal slides, EB trust comparison, and ROP bond term sheet for MTG-005.',
      task_type: 'PREPARATION',
      priority: 'MEDIUM' as const,
      due_date: dateStr(daysFromNow(5)),
      assigned_to: userIds['rm_2'] ?? 2,
      assigned_by: userIds['rm_2'] ?? 2,
      task_status: 'IN_PROGRESS' as const,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
  ];

  let count = 0;
  for (const r of rows) {
    const ex = await db.select().from(schema.crmTasks)
      .where(eq(schema.crmTasks.task_code, r.task_code)).limit(1);
    if (ex.length) { count++; continue; }
    await db.insert(schema.crmTasks).values(r as any);
    count++;
  }

  console.log(`  → ${count} CRM tasks seeded`);
}

// ─── 18. crm_notifications ───────────────────────────────────────────────────

async function seedCrmNotifications(leadIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[18] Seeding crm_notifications...');

  const rows = [
    {
      recipient_user_id: userIds['rm_1'] ?? 1,
      type: 'MEETING_REMINDER' as const,
      title: 'Meeting Tomorrow: Maria Reyes-Lopez Portfolio Review',
      message: 'MTG-004 is scheduled for tomorrow at 10:00 AM. Ensure rebalancing proposal is ready.',
      channel: 'IN_APP' as const,
      related_entity_type: 'meeting',
      related_entity_id: 4,
      is_read: false,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      recipient_user_id: userIds['rm_1'] ?? 1,
      type: 'TASK_DUE' as const,
      title: 'Overdue Task: Submit CR-003 for Approval',
      message: 'Call report CR-003 (Pagkakaisa Holdings) is 2 days overdue. Submit immediately to avoid SLA breach.',
      channel: 'IN_APP' as const,
      related_entity_type: 'crm_task',
      related_entity_id: 2,
      is_read: false,
      created_by_user_id: userIds['checker_1'] ?? 5,
    },
    {
      recipient_user_id: userIds['rm_2'] ?? 2,
      type: 'LEAD_ASSIGNED' as const,
      title: 'New Lead Assigned: Dr. Eduardo Reyes Jr.',
      message: 'UHNW lead LEAD-006 (Dr. Eduardo Reyes Jr., Est. AUM PHP 280M) has been assigned to you. Priority prospect.',
      channel: 'IN_APP' as const,
      related_entity_type: 'lead',
      related_entity_id: leadIds['LEAD-006'],
      is_read: true,
      read_at: daysAgo(7),
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      recipient_user_id: userIds['rm_1'] ?? 1,
      type: 'TASK_ASSIGNED' as const,
      title: 'Task Assigned: Prepare Rebalancing Proposal for CLT-002',
      message: 'Patrick (rm_1), please prepare the rebalancing proposal for Maria Reyes-Lopez ahead of MTG-004.',
      channel: 'IN_APP' as const,
      related_entity_type: 'crm_task',
      is_read: true,
      read_at: daysAgo(3),
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      recipient_user_id: userIds['rm_3'] ?? 3,
      type: 'TASK_DUE' as const,
      title: 'Task Due Today: Negative List Check — Visayas Agritech',
      message: 'Compliance check for PROSP-004 is due today. Contact compliance_officer to expedite screening.',
      channel: 'IN_APP' as const,
      related_entity_type: 'crm_task',
      related_entity_id: 6,
      is_read: false,
      created_by_user_id: userIds['compliance_officer'] ?? 8,
    },
    {
      recipient_user_id: userIds['rm_2'] ?? 2,
      type: 'MEETING_REMINDER' as const,
      title: 'Meeting in 7 Days: Mindanao Dev Authority Investment Proposal',
      message: 'MTG-005 with Mindanao Dev Authority is scheduled in 7 days. Prepare EB trust proposal and ROP bond term sheet.',
      channel: 'IN_APP' as const,
      related_entity_type: 'meeting',
      related_entity_id: 5,
      is_read: false,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
    {
      recipient_user_id: userIds['trust_officer_1'] ?? 3,
      type: 'TASK_ASSIGNED' as const,
      title: 'KYC Renewal Due: Eduardo Tan (CLT-001)',
      message: 'KYC renewal for CLT-001 is due in 30 days. Initiate renewal process per compliance SOP.',
      channel: 'IN_APP' as const,
      related_entity_type: 'crm_task',
      related_entity_id: 4,
      is_read: false,
      created_by_user_id: userIds['compliance_officer'] ?? 8,
    },
    {
      recipient_user_id: userIds['checker_1'] ?? 5,
      type: 'CALL_REPORT_RETURNED' as const,
      title: 'Call Report Pending Review: CR-003',
      message: 'Call report CR-003 (Pagkakaisa Holdings) is in DRAFT and awaiting submission. Follow up with rm_1.',
      channel: 'IN_APP' as const,
      related_entity_type: 'call_report',
      related_entity_id: 3,
      is_read: false,
      created_by_user_id: userIds['checker_1'] ?? 5,
    },
    {
      recipient_user_id: userIds['branch_head'] ?? 6,
      type: 'SLA_BREACH' as const,
      title: 'SLA Warning: 2 Overdue Call Reports',
      message: 'Call report filing SLA (5 business days) at risk. CR-003 is 2 days overdue. Management action required.',
      channel: 'IN_APP' as const,
      related_entity_type: 'call_report',
      is_read: false,
      created_by_user_id: userIds['compliance_officer'] ?? 8,
    },
    {
      recipient_user_id: userIds['rm_2'] ?? 2,
      type: 'CAMPAIGN_APPROVED' as const,
      title: 'Campaign Approved: CMP-2026-002 — ROP Bond Subscription',
      message: 'Campaign CMP-2026-002 (ROP Bond April 2026) has been approved by branch head. You may now proceed with lead outreach.',
      channel: 'IN_APP' as const,
      related_entity_type: 'campaign',
      is_read: true,
      read_at: daysAgo(17),
      created_by_user_id: userIds['bo_head'] ?? 7,
    },
  ];

  let count = 0;
  for (const r of rows) {
    await db.insert(schema.crmNotifications).values(r as any);
    count++;
  }

  console.log(`  → ${count} CRM notifications seeded`);
}

// ─── 19. rm_handovers ────────────────────────────────────────────────────────

async function seedRmHandovers(userIds: Record<string, number>) {
  console.log('\n[19] Seeding rm_handovers...');

  const rows = [
    {
      handover_type: 'TEMPORARY' as const,
      entity_type: 'client',
      entity_id: 1,  // CLT-001
      from_rm_id: userIds['rm_1'] ?? 1,
      to_rm_id: userIds['rm_2'] ?? 2,
      reason: 'rm_1 on approved leave April 28 – May 3. Temporary coverage for Eduardo Tan portfolio and pending MTG-004.',
      effective_date: dateStr(daysFromNow(1)),
      end_date: dateStr(daysFromNow(6)),
      handover_status: 'APPROVED' as const,
      approved_by: userIds['branch_head'] ?? 6,
      approved_at: daysAgo(1),
      notes: 'rm_2 to monitor portfolio and cover MTG-004 if rm_1 does not return in time.',
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      handover_type: 'PERMANENT' as const,
      entity_type: 'lead',
      entity_id: 6,  // LEAD-006 Dr. Eduardo Reyes
      from_rm_id: userIds['rm_3'] ?? 3,
      to_rm_id: userIds['rm_2'] ?? 2,
      reason: 'LEAD-006 is UHNW with estimated AUM PHP 280M. Reassigned to rm_2 who manages HNW book in Manila.',
      effective_date: dateStr(daysAgo(5)),
      handover_status: 'APPROVED' as const,
      approved_by: userIds['branch_head'] ?? 6,
      approved_at: daysAgo(6),
      notes: 'Initial contact notes and call history transferred. rm_2 to take over all further engagement.',
      created_by_user_id: userIds['branch_head'] ?? 6,
    },
    {
      handover_type: 'TEMPORARY' as const,
      entity_type: 'prospect',
      entity_id: 3,  // PROSP-003
      from_rm_id: userIds['rm_1'] ?? 1,
      to_rm_id: userIds['rm_3'] ?? 3,
      reason: 'Prospect Natividad Escudero-Lim recently relocated to Cebu. Interim coverage by Cebu RM for convenience.',
      effective_date: dateStr(daysAgo(10)),
      end_date: dateStr(daysFromNow(20)),
      handover_status: 'PENDING' as const,
      notes: 'Pending branch head approval. Prospect has been informed of potential handover.',
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
  ];

  let count = 0;
  for (const r of rows) {
    await db.insert(schema.rmHandovers).values(r as any);
    count++;
  }

  console.log(`  → ${count} RM handovers seeded`);
}

// ─── 20. crm_expenses ────────────────────────────────────────────────────────

async function seedCrmExpenses(meetingIds: Record<string, number>, crIds: Record<string, number>, userIds: Record<string, number>) {
  console.log('\n[20] Seeding crm_expenses...');

  const rows = [
    {
      expense_ref: 'EXP-2026-001',
      call_report_id: crIds['CR-001'],
      meeting_id: meetingIds['MTG-001'],
      expense_type: 'ENTERTAINMENT',
      amount: '18500.00',
      currency: 'PHP',
      expense_date: dateStr(daysAgo(14)),
      description: 'Business lunch at Nobu Manila for annual portfolio review with Eduardo Tan. (2 pax)',
      expense_status: 'APPROVED',
      approved_by: userIds['branch_head'] ?? 6,
      approved_at: daysAgo(12),
      submitted_by: userIds['rm_1'] ?? 1,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      expense_ref: 'EXP-2026-002',
      call_report_id: crIds['CR-002'],
      meeting_id: meetingIds['MTG-002'],
      expense_type: 'TRANSPORTATION',
      amount: '2800.00',
      currency: 'PHP',
      expense_date: dateStr(daysAgo(30)),
      description: 'Cebu-Manila roundtrip airfare for onboarding meeting with Carlos Bautista.',
      expense_status: 'APPROVED',
      approved_by: userIds['branch_head'] ?? 6,
      approved_at: daysAgo(28),
      submitted_by: userIds['rm_3'] ?? 3,
      created_by_user_id: userIds['rm_3'] ?? 3,
    },
    {
      expense_ref: 'EXP-2026-003',
      meeting_id: meetingIds['MTG-003'],
      expense_type: 'ENTERTAINMENT',
      amount: '32000.00',
      currency: 'PHP',
      expense_date: dateStr(daysAgo(7)),
      description: 'Dinner at Brasserie Cicou for quarterly update with Pagkakaisa Holdings board. (4 pax)',
      expense_status: 'DRAFT',
      submitted_by: userIds['rm_1'] ?? 1,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      expense_ref: 'EXP-2026-004',
      expense_type: 'GIFTS',
      amount: '4500.00',
      currency: 'PHP',
      expense_date: dateStr(daysAgo(5)),
      description: 'Client appreciation gift basket for Maria Reyes-Lopez (upcoming birthday).',
      expense_status: 'DRAFT',
      submitted_by: userIds['rm_1'] ?? 1,
      created_by_user_id: userIds['rm_1'] ?? 1,
    },
    {
      expense_ref: 'EXP-2026-005',
      meeting_id: meetingIds['MTG-005'],
      expense_type: 'TRANSPORTATION',
      amount: '15600.00',
      currency: 'PHP',
      expense_date: dateStr(daysFromNow(7)),
      description: 'Manila-CDO-Manila airfare for Mindanao Dev Authority investment proposal presentation. (2 pax)',
      expense_status: 'DRAFT',
      submitted_by: userIds['rm_2'] ?? 2,
      created_by_user_id: userIds['rm_2'] ?? 2,
    },
  ];

  let count = 0;
  for (const r of rows) {
    const ex = await db.select().from(schema.crmExpenses)
      .where(eq(schema.crmExpenses.expense_ref, r.expense_ref)).limit(1);
    if (ex.length) { count++; continue; }
    await db.insert(schema.crmExpenses).values(r as any);
    count++;
  }

  console.log(`  → ${count} CRM expenses seeded`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS Philippines — CRM Full Seed                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${(process.env.DATABASE_URL ?? '').replace(/:([^:@]+)@/, ':***@')}`);

  // Verify DB connection
  await db.select().from(schema.users).limit(1);
  console.log('[DB] Connection verified');

  // Load existing reference data IDs
  const userIds = await getUserIds();
  const meetingIds = await getMeetingIds();
  const callReportIds = await getCallReportIds();

  console.log(`  Found: ${Object.keys(userIds).length} users, ${Object.keys(meetingIds).length} meetings, ${Object.keys(callReportIds).length} call reports`);

  if (Object.keys(userIds).length === 0) {
    console.error('ERROR: No users found. Run seed-demo-data.ts first.');
    process.exit(1);
  }

  // Run seedings in FK dependency order
  const ruleIds       = await seedLeadRules(userIds);
  const campaignIds   = await seedCampaigns(userIds);
  const listIds       = await seedLeadLists(userIds, ruleIds);
  const leadIds       = await seedLeads(userIds, campaignIds);
  await seedLeadEnrichment(leadIds, userIds);
  const memberMap     = await seedLeadListMembers(leadIds, listIds, userIds);
  await seedCampaignLists(campaignIds, listIds, userIds);
  await seedCampaignResponses(campaignIds, leadIds, memberMap, listIds, userIds);
  await seedCampaignCommunications(campaignIds, listIds, userIds);
  const prospectIds   = await seedProspects(leadIds, campaignIds, userIds);
  await seedProspectEnrichment(prospectIds, userIds);
  await seedConsentLog(leadIds, prospectIds, userIds);
  await seedMeetingInvitees(meetingIds, leadIds, prospectIds, userIds);
  await seedCallReportFeedback(callReportIds, userIds);
  await seedCallReportApprovals(callReportIds, userIds);
  await seedOpportunitiesExtended(leadIds, prospectIds, campaignIds, callReportIds, userIds);
  await seedCrmTasks(leadIds, prospectIds, userIds);
  await seedCrmNotifications(leadIds, userIds);
  await seedRmHandovers(userIds);
  await seedCrmExpenses(meetingIds, callReportIds, userIds);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   CRM seed completed successfully!                            ║');
  console.log('║                                                                ║');
  console.log('║   Seeded: campaigns, lead_lists, leads (+ enrichment),        ║');
  console.log('║   prospects (+ enrichment), campaign_lists, responses,         ║');
  console.log('║   communications, consent_log, meeting_invitees,              ║');
  console.log('║   call_report_feedback, call_report_approvals,                ║');
  console.log('║   opportunities, crm_tasks, crm_notifications,                ║');
  console.log('║   rm_handovers, crm_expenses, lead_rules                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// ESM main guard
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => { process.exit(0); })
    .catch((err) => {
      console.error('\n[ERROR] CRM seed failed:', err?.cause?.message ?? err?.message ?? err);
      process.exit(1);
    });
}
