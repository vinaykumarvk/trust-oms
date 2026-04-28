/**
 * TrustOMS — Group B: Feature Demo Data Seed
 *
 * Populates feature-specific tables that require real FK references
 * to clients / users / portfolios seeded earlier.
 *
 * Tables seeded (in FK dependency order):
 *   1.  beneficial_owners
 *   2.  client_fatca_crs
 *   3.  document_deficiencies
 *   4.  consent_records
 *   5.  held_away_assets
 *   6.  standing_instructions
 *   7.  scheduled_plans
 *   8.  pera_accounts → pera_transactions
 *   9.  customer_risk_profiles → customer_risk_responses
 *  10.  investment_proposals → proposal_line_items → proposal_approvals
 *  11.  compliance_escalations
 *  12.  risk_profiling_audit_logs
 *  13.  handovers → handover_items → scrutiny_checklist_items → compliance_gates → handover_audit_log
 *  14.  delegation_requests → delegation_items
 *  15.  dsar_requests
 *  16.  approval_requests
 *  17.  service_request_documents
 *  18.  sr_status_history
 *  19.  client_statements
 *  20.  client_messages
 *  21.  feed_health_snapshots
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import { fileURLToPath } from 'url';

const SYSTEM_USER = 1;

// ── Reference data queried at startup ────────────────────────────────────────

interface Refs {
  clientIds: string[];
  portfolioIds: string[];
  userIds: number[];
  headUserId: number;
  adminUserId: number;
  questionnaireId: number;
  srIds: number[];
  scrutinyTemplateIds: number[];
}

async function loadRefs(): Promise<Refs> {
  const clients = await db.select({ id: schema.clients.client_id }).from(schema.clients).limit(10);
  const portfolios = await db.select({ id: schema.portfolios.portfolio_id, cid: schema.portfolios.client_id }).from(schema.portfolios).limit(10);
  const users = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users);
  const [q] = await db.select({ id: schema.questionnaires.id }).from(schema.questionnaires).limit(1);
  const srs = await db.select({ id: schema.serviceRequests.id }).from(schema.serviceRequests).limit(6);
  const scrutiny = await db.select({ id: schema.scrutinyTemplates.id }).from(schema.scrutinyTemplates).limit(9);

  const headUser = users.find((u: { id: number; role: string | null }) => u.role === 'bo_head') ?? users[0];
  const adminUser = users.find((u: { id: number; role: string | null }) => u.role === 'bo_admin') ?? users[0];

  return {
    clientIds: clients.map((c: { id: string }) => c.id),
    portfolioIds: portfolios.map((p: { id: string }) => p.id),
    userIds: users.map((u: { id: number }) => u.id),
    headUserId: headUser.id,
    adminUserId: adminUser.id,
    questionnaireId: q?.id ?? 1,
    srIds: srs.map((s: { id: number }) => s.id),
    scrutinyTemplateIds: scrutiny.map((s: { id: number }) => s.id),
  };
}

// ── 1. Beneficial Owners ──────────────────────────────────────────────────────

async function seedBeneficialOwners(refs: Refs) {
  console.log('[1] Seeding beneficial_owners...');
  const rows = [
    { client_id: refs.clientIds[0], ubo_name: 'Ricardo M. Santos', ubo_tin: '123-456-789-000', ownership_pct: '60.00', verified: true },
    { client_id: refs.clientIds[1], ubo_name: 'Elena D. Reyes', ubo_tin: '234-567-890-001', ownership_pct: '100.00', verified: true },
    { client_id: refs.clientIds[2], ubo_name: 'Antonio P. Cruz', ubo_tin: '345-678-901-002', ownership_pct: '45.00', verified: false },
    { client_id: refs.clientIds[2], ubo_name: 'Maria C. Cruz', ubo_tin: '345-678-901-003', ownership_pct: '55.00', verified: false },
    { client_id: refs.clientIds[3], ubo_name: 'Christopher J. Lim', ubo_tin: '456-789-012-004', ownership_pct: '100.00', verified: true },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.beneficialOwners)
      .where(sql`client_id = ${r.client_id} AND ubo_tin = ${r.ubo_tin}`).limit(1);
    if (!ex) {
      await db.insert(schema.beneficialOwners).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} beneficial owners seeded`);
}

// ── 2. Client FATCA/CRS ───────────────────────────────────────────────────────

async function seedClientFatcaCrs(refs: Refs) {
  console.log('[2] Seeding client_fatca_crs...');
  const rows = [
    { client_id: refs.clientIds[0], us_person: false, reporting_jurisdictions: ['PH'], tin_foreign: null },
    { client_id: refs.clientIds[1], us_person: false, reporting_jurisdictions: ['PH', 'SG'], tin_foreign: 'SG-T1234567A' },
    { client_id: refs.clientIds[2], us_person: true, reporting_jurisdictions: ['PH', 'US'], tin_foreign: '123-45-6789' },
    { client_id: refs.clientIds[3], us_person: false, reporting_jurisdictions: ['PH'], tin_foreign: null },
    { client_id: refs.clientIds[4], us_person: false, reporting_jurisdictions: ['PH', 'HK'], tin_foreign: 'HK-A1234567' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.clientFatcaCrs)
      .where(eq(schema.clientFatcaCrs.client_id, r.client_id)).limit(1);
    if (!ex) {
      await db.insert(schema.clientFatcaCrs).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} FATCA/CRS records seeded`);
}

// ── 3. Document Deficiencies ──────────────────────────────────────────────────

async function seedDocumentDeficiencies(refs: Refs) {
  console.log('[3] Seeding document_deficiencies...');
  const rows = [
    { client_id: refs.clientIds[0], doc_type: 'VALID_ID', required: true, deadline: '2026-06-30', deficiency_status: 'OUTSTANDING' as const },
    { client_id: refs.clientIds[1], doc_type: 'PROOF_OF_ADDRESS', required: true, deadline: '2026-05-31', deficiency_status: 'SUBMITTED' as const },
    { client_id: refs.clientIds[2], doc_type: 'UBO_DECLARATION', required: true, deadline: '2026-07-15', deficiency_status: 'OUTSTANDING' as const },
    { client_id: refs.clientIds[3], doc_type: 'FATCA_SELF_CERT', required: true, deadline: '2026-05-15', deficiency_status: 'VERIFIED' as const },
    { client_id: refs.clientIds[4], doc_type: 'INCOME_DOCUMENTS', required: false, deadline: '2026-08-31', deficiency_status: 'OUTSTANDING' as const },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.documentDeficiencies)
      .where(sql`client_id = ${r.client_id} AND doc_type = ${r.doc_type}`).limit(1);
    if (!ex) {
      await db.insert(schema.documentDeficiencies).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} document deficiencies seeded`);
}

// ── 4. Consent Records ────────────────────────────────────────────────────────

async function seedConsentRecords(refs: Refs) {
  console.log('[4] Seeding consent_records...');
  const rows = [
    { consent_id: 'CST-2026-001', client_id: refs.clientIds[0], purpose: 'MARKETING' as const, channel_scope: ['EMAIL', 'SMS'], granted: true, granted_at: new Date('2026-01-10'), legal_basis: 'CONSENT' as const, dpa_ref: 'DPA-2012-PH' },
    { consent_id: 'CST-2026-002', client_id: refs.clientIds[1], purpose: 'RESEARCH_AGGREGATE' as const, channel_scope: ['EMAIL'], granted: true, granted_at: new Date('2026-01-15'), legal_basis: 'LEGITIMATE_INTEREST' as const, dpa_ref: 'DPA-2012-PH' },
    { consent_id: 'CST-2026-003', client_id: refs.clientIds[2], purpose: 'AUTOMATED_DECISION' as const, channel_scope: ['EMAIL', 'PUSH'], granted: false, granted_at: new Date('2026-02-01'), withdrawn_at: new Date('2026-03-15'), legal_basis: 'CONSENT' as const, dpa_ref: 'DPA-2012-PH' },
    { consent_id: 'CST-2026-004', client_id: refs.clientIds[3], purpose: 'MARKETING' as const, channel_scope: ['SMS'], granted: true, granted_at: new Date('2026-01-20'), legal_basis: 'CONSENT' as const, dpa_ref: 'DPA-2012-PH' },
    { consent_id: 'CST-2026-005', client_id: refs.clientIds[4], purpose: 'OPERATIONAL' as const, channel_scope: ['EMAIL', 'PUSH'], granted: true, granted_at: new Date('2026-02-10'), legal_basis: 'LEGITIMATE_INTEREST' as const, dpa_ref: 'DPA-2012-PH' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.consentRecords)
      .where(eq(schema.consentRecords.consent_id, r.consent_id)).limit(1);
    if (!ex) {
      await db.insert(schema.consentRecords).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} consent records seeded`);
}

// ── 5. Held-Away Assets ───────────────────────────────────────────────────────

async function seedHeldAwayAssets(refs: Refs) {
  console.log('[5] Seeding held_away_assets...');
  const rows = [
    { portfolio_id: refs.portfolioIds[0], asset_class: 'EQUITY', description: 'PSE-listed Equities at BDO', custodian: 'BDO Securities', location: 'PH', market_value: '5000000', currency: 'PHP', as_of_date: '2026-04-01' },
    { portfolio_id: refs.portfolioIds[1], asset_class: 'FIXED_INCOME', description: 'Treasury Bonds at BPI', custodian: 'BPI Trust', location: 'PH', market_value: '10000000', currency: 'PHP', as_of_date: '2026-04-01' },
    { portfolio_id: refs.portfolioIds[2], asset_class: 'EQUITY', description: 'US Stocks at TD Ameritrade', custodian: 'TD Ameritrade', location: 'US', market_value: '25000', currency: 'USD', as_of_date: '2026-04-01' },
    { portfolio_id: refs.portfolioIds[3], asset_class: 'REAL_ESTATE', description: 'REIT Units — SM Prime', custodian: 'COL Financial', location: 'PH', market_value: '2000000', currency: 'PHP', as_of_date: '2026-04-01' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.heldAwayAssets)
      .where(sql`portfolio_id = ${r.portfolio_id} AND description = ${r.description}`).limit(1);
    if (!ex) {
      await db.insert(schema.heldAwayAssets).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} held-away assets seeded`);
}

// ── 6. Standing Instructions ──────────────────────────────────────────────────

async function seedStandingInstructions(refs: Refs) {
  console.log('[6] Seeding standing_instructions...');
  const rows = [
    { portfolio_id: refs.portfolioIds[0], instruction_type: 'AUTO_ROLL' as const, params: { target_product: 'UITF-001', roll_on_maturity: true }, is_active: true, next_execution_date: '2026-05-01' },
    { portfolio_id: refs.portfolioIds[1], instruction_type: 'AUTO_CREDIT' as const, params: { target_account: 'ACC-12345', frequency: 'MONTHLY', amount: 50000 }, is_active: true, next_execution_date: '2026-05-01' },
    { portfolio_id: refs.portfolioIds[2], instruction_type: 'AUTO_WITHDRAWAL' as const, params: { target_account: 'ACC-67890', amount: 25000, frequency: 'QUARTERLY' }, is_active: true, next_execution_date: '2026-07-01' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.standingInstructions)
      .where(sql`portfolio_id = ${r.portfolio_id} AND instruction_type = ${r.instruction_type}`).limit(1);
    if (!ex) {
      await db.insert(schema.standingInstructions).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} standing instructions seeded`);
}

// ── 7. Scheduled Plans ────────────────────────────────────────────────────────

async function seedScheduledPlans(refs: Refs) {
  console.log('[7] Seeding scheduled_plans...');
  const rows = [
    { client_id: refs.clientIds[0], portfolio_id: refs.portfolioIds[0], plan_type: 'EIP' as const, amount: '5000', currency: 'PHP', frequency: 'MONTHLY', next_execution_date: '2026-05-01', scheduled_plan_status: 'ACTIVE' as const },
    { client_id: refs.clientIds[1], portfolio_id: refs.portfolioIds[1], plan_type: 'ERP' as const, amount: '10000', currency: 'PHP', frequency: 'QUARTERLY', next_execution_date: '2026-07-01', scheduled_plan_status: 'ACTIVE' as const },
    { client_id: refs.clientIds[2], portfolio_id: refs.portfolioIds[2], plan_type: 'EIP' as const, amount: '3000', currency: 'PHP', frequency: 'MONTHLY', next_execution_date: '2026-05-01', scheduled_plan_status: 'PAUSED' as const },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.scheduledPlans)
      .where(sql`client_id = ${r.client_id} AND plan_type = ${r.plan_type}`).limit(1);
    if (!ex) {
      await db.insert(schema.scheduledPlans).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} scheduled plans seeded`);
}

// ── 8. PERA Accounts & Transactions ──────────────────────────────────────────

async function seedPeraData(refs: Refs) {
  console.log('[8] Seeding pera_accounts, pera_transactions...');
  const accounts = [
    { contributor_id: refs.clientIds[0], administrator: 'TrustBank Philippines', balance: '150000', contribution_ytd: '50000', max_contribution_annual: '100000', tin: '123-456-789' },
    { contributor_id: refs.clientIds[1], administrator: 'TrustBank Philippines', balance: '280000', contribution_ytd: '100000', max_contribution_annual: '200000', tin: '234-567-890' },
    { contributor_id: refs.clientIds[2], administrator: 'TrustBank Philippines', balance: '75000', contribution_ytd: '25000', max_contribution_annual: '100000', tin: '345-678-901' },
  ];

  let acctSeeded = 0;
  let txnSeeded = 0;
  const acctIds: number[] = [];

  for (const a of accounts) {
    const [ex] = await db.select().from(schema.peraAccounts)
      .where(eq(schema.peraAccounts.contributor_id, a.contributor_id)).limit(1);
    if (ex) {
      acctIds.push(ex.id);
    } else {
      const [ins] = await db.insert(schema.peraAccounts).values({ ...a, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER }).returning();
      acctIds.push(ins.id);
      acctSeeded++;
    }
  }

  // Seed transactions for each account
  const txnTemplates = [
    { type: 'CONTRIBUTION' as const, amount: '50000', pera_txn_status: 'SETTLED' },
    { type: 'CONTRIBUTION' as const, amount: '25000', pera_txn_status: 'SETTLED' },
  ];
  for (const aid of acctIds) {
    for (const t of txnTemplates) {
      const [ex] = await db.select().from(schema.peraTransactions)
        .where(sql`pera_account_id = ${aid} AND type = ${t.type} AND amount = ${t.amount}`).limit(1);
      if (!ex) {
        await db.insert(schema.peraTransactions).values({ pera_account_id: aid, ...t, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
        txnSeeded++;
      }
    }
  }
  console.log(`  → ${acctSeeded} PERA accounts, ${txnSeeded} transactions seeded`);
}

// ── 9. Customer Risk Profiles & Responses ────────────────────────────────────

async function seedRiskProfiles(refs: Refs): Promise<number[]> {
  console.log('[9] Seeding customer_risk_profiles, customer_risk_responses...');

  // Load question/answer IDs from the questionnaire seeded in Group A
  const questions = await db.select({ id: schema.questions.id }).from(schema.questions)
    .where(eq(schema.questions.questionnaire_id, refs.questionnaireId));
  const answers = await db.select({ id: schema.answerOptions.id, qid: schema.answerOptions.question_id })
    .from(schema.answerOptions);

  const profileDefs = [
    { client_id: refs.clientIds[0], risk_category: 'MODERATE', risk_code: 2, score: '55.00' },
    { client_id: refs.clientIds[1], risk_category: 'GROWTH', risk_code: 4, score: '75.00' },
    { client_id: refs.clientIds[2], risk_category: 'CONSERVATIVE', risk_code: 1, score: '20.00' },
    { client_id: refs.clientIds[3], risk_category: 'BALANCED', risk_code: 3, score: '60.00' },
    { client_id: refs.clientIds[4], risk_category: 'AGGRESSIVE', risk_code: 5, score: '90.00' },
  ];

  let profSeeded = 0;
  let respSeeded = 0;
  const profileIds: number[] = [];

  for (const p of profileDefs) {
    const [ex] = await db.select().from(schema.customerRiskProfiles)
      .where(sql`customer_id = ${p.client_id} AND is_active = true`).limit(1);
    if (ex) {
      profileIds.push(ex.id);
      continue;
    }
    const [ins] = await db.insert(schema.customerRiskProfiles).values({
      customer_id: p.client_id,
      questionnaire_id: refs.questionnaireId,
      assessment_date: '2026-01-15',
      expiry_date: '2028-01-15',
      total_raw_score: p.score,
      computed_risk_category: p.risk_category,
      computed_risk_code: p.risk_code,
      effective_risk_category: p.risk_category,
      effective_risk_code: p.risk_code,
      is_active: true,
      assessed_by: refs.headUserId,
      supervisor_approved: true,
      supervisor_id: refs.headUserId,
      acknowledgement_accepted: true,
      disclaimer_accepted: true,
      created_by_user_id: SYSTEM_USER,
      updated_by_user_id: SYSTEM_USER,
    }).returning();
    profileIds.push(ins.id);
    profSeeded++;

    // Seed one response per question for this profile
    for (const q of questions) {
      const qAnswers = answers.filter((a: { qid: number; text: string; score: number }) => a.qid === q.id);
      if (qAnswers.length === 0) continue;
      const answerOpt = qAnswers[Math.min(p.risk_code - 1, qAnswers.length - 1)];
      await db.insert(schema.customerRiskResponses).values({
        risk_profile_id: ins.id,
        question_id: q.id,
        answer_option_id: answerOpt.id,
        raw_score: '10',
        normalized_score: p.score,
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      });
      respSeeded++;
    }
  }
  console.log(`  → ${profSeeded} risk profiles, ${respSeeded} responses seeded`);
  return profileIds;
}

// ── 10. Investment Proposals ──────────────────────────────────────────────────

async function seedInvestmentProposals(refs: Refs, profileIds: number[]) {
  console.log('[10] Seeding investment_proposals, proposal_line_items, proposal_approvals...');

  const proposals = [
    { proposal_number: 'PROP-2026-001', customer_id: refs.clientIds[0], profile_idx: 0, title: 'Balanced Growth Portfolio', objective: 'BALANCED' as const, horizon: 5, amount: '2000000', status: 'CLIENT_ACCEPTED' as const },
    { proposal_number: 'PROP-2026-002', customer_id: refs.clientIds[1], profile_idx: 1, title: 'Equity Growth Strategy', objective: 'GROWTH' as const, horizon: 7, amount: '5000000', status: 'SENT_TO_CLIENT' as const },
    { proposal_number: 'PROP-2026-003', customer_id: refs.clientIds[2], profile_idx: 2, title: 'Capital Preservation Plan', objective: 'CAPITAL_PRESERVATION' as const, horizon: 3, amount: '1000000', status: 'L1_APPROVED' as const },
    { proposal_number: 'PROP-2026-004', customer_id: refs.clientIds[3], profile_idx: 3, title: 'Income Fund Strategy', objective: 'INCOME' as const, horizon: 4, amount: '3000000', status: 'DRAFT' as const },
  ];

  let propSeeded = 0;
  let lineSeeded = 0;
  let approvalSeeded = 0;

  for (const p of proposals) {
    const [ex] = await db.select().from(schema.investmentProposals)
      .where(eq(schema.investmentProposals.proposal_number, p.proposal_number)).limit(1);
    if (ex) continue;

    const profileId = profileIds[p.profile_idx] ?? profileIds[0];
    const [ins] = await db.insert(schema.investmentProposals).values({
      proposal_number: p.proposal_number,
      customer_id: p.customer_id,
      risk_profile_id: profileId,
      title: p.title,
      investment_objective: p.objective,
      time_horizon_years: p.horizon,
      proposed_amount: p.amount,
      currency: 'PHP',
      proposal_status: p.status,
      suitability_check_passed: true,
      expected_return_pct: '8.50',
      expected_std_dev_pct: '12.00',
      rm_id: refs.headUserId,
      entity_id: 'default',
      created_by_user_id: SYSTEM_USER,
      updated_by_user_id: SYSTEM_USER,
    }).returning();
    propSeeded++;

    // Line items
    const lines = [
      { asset_class: 'EQUITY', product_name: 'UITF Equity Fund', allocation_percentage: '60', allocation_amount: String(Number(p.amount) * 0.60) },
      { asset_class: 'FIXED_INCOME', product_name: 'UITF Bond Fund', allocation_percentage: '30', allocation_amount: String(Number(p.amount) * 0.30) },
      { asset_class: 'MONEY_MARKET', product_name: 'Money Market Fund', allocation_percentage: '10', allocation_amount: String(Number(p.amount) * 0.10) },
    ];
    for (const l of lines) {
      await db.insert(schema.proposalLineItems).values({ proposal_id: ins.id, ...l, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      lineSeeded++;
    }

    // Approval for accepted proposals
    if (['L1_APPROVED', 'COMPLIANCE_APPROVED', 'SENT_TO_CLIENT', 'CLIENT_ACCEPTED'].includes(p.status)) {
      await db.insert(schema.proposalApprovals).values({
        proposal_id: ins.id,
        approval_level: 'L1_SUPERVISOR',
        action: 'APPROVED',
        acted_by: refs.headUserId,
        comments: 'Approved — risk suitable.',
        acted_at: new Date('2026-01-20'),
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      });
      approvalSeeded++;
    }
  }
  console.log(`  → ${propSeeded} proposals, ${lineSeeded} line items, ${approvalSeeded} approvals seeded`);
}

// ── 11. Compliance Escalations ────────────────────────────────────────────────

async function seedComplianceEscalations(refs: Refs, profileIds: number[]) {
  console.log('[11] Seeding compliance_escalations...');
  const rows = [
    { customer_id: refs.clientIds[0], escalation_type: 'REPEAT_DEVIATION' as const, deviation_count: 3, window_start_date: '2026-01-01', window_end_date: '2026-03-31', deviation_ids: [1, 2, 3], escalation_status: 'OPEN' as const },
    { customer_id: refs.clientIds[1], escalation_type: 'MANUAL' as const, deviation_count: 1, window_start_date: '2026-02-01', window_end_date: '2026-04-30', deviation_ids: [4], escalation_status: 'ACKNOWLEDGED' as const },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.complianceEscalations)
      .where(eq(schema.complianceEscalations.customer_id, r.customer_id)).limit(1);
    if (!ex) {
      await db.insert(schema.complianceEscalations).values({ ...r, assigned_to: refs.headUserId, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} compliance escalations seeded`);
}

// ── 12. Risk Profiling Audit Logs ─────────────────────────────────────────────

async function seedRiskProfilingAuditLogs(refs: Refs, profileIds: number[]) {
  console.log('[12] Seeding risk_profiling_audit_logs...');
  const rows = [
    { session_id: 'SES-RP-001', customer_id: refs.clientIds[0], initiated_by: refs.headUserId, outcome: 'COMPLETED' as const, duration_seconds: 420, risk_profile_id: profileIds[0] ?? null, device_type: 'desktop' },
    { session_id: 'SES-RP-002', customer_id: refs.clientIds[1], initiated_by: refs.headUserId, outcome: 'COMPLETED' as const, duration_seconds: 380, risk_profile_id: profileIds[1] ?? null, device_type: 'desktop' },
    { session_id: 'SES-RP-003', customer_id: refs.clientIds[2], initiated_by: refs.headUserId, outcome: 'ABANDONED' as const, duration_seconds: 120, risk_profile_id: null, device_type: 'mobile' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.riskProfilingAuditLogs)
      .where(eq(schema.riskProfilingAuditLogs.session_id, r.session_id)).limit(1);
    if (!ex) {
      await db.insert(schema.riskProfilingAuditLogs).values({ ...r, initiated_at: new Date(), entity_id: 'default' });
      seeded++;
    }
  }
  console.log(`  → ${seeded} risk profiling audit logs seeded`);
}

// ── 13. Handovers ─────────────────────────────────────────────────────────────

async function seedHandovers(refs: Refs): Promise<number[]> {
  console.log('[13] Seeding handovers, handover_items, scrutiny_checklist_items, compliance_gates, handover_audit_log...');

  const outRmId = refs.userIds[0];
  const inRmId = refs.userIds[1];

  // Each handover uses a unique client to avoid the unique index on (entity_id) for active items
  const handoverDefs = [
    { handover_number: 'HOV-2026-001', entity_type: 'client' as const, reason: 'RM Resignation — planned transfer', status: 'authorized' as const, itemEntityId: refs.clientIds[0], itemStatus: 'transferred' },
    { handover_number: 'HOV-2026-002', entity_type: 'client' as const, reason: 'Territory Realignment Q2 2026', status: 'pending_auth' as const, itemEntityId: refs.clientIds[4], itemStatus: 'included' },
    { handover_number: 'HOV-2026-003', entity_type: 'lead' as const, reason: 'Maternity Leave Coverage', status: 'draft' as const, itemEntityId: refs.clientIds[5], itemStatus: 'included' },
  ];

  let hovSeeded = 0;
  let itemSeeded = 0;
  let scrutinySeeded = 0;
  let gateSeeded = 0;
  let auditSeeded = 0;
  const handoverIds: number[] = [];

  for (const h of handoverDefs) {
    // Upsert the handover
    let handoverId: number;
    const [ex] = await db.select().from(schema.handovers)
      .where(eq(schema.handovers.handover_number, h.handover_number)).limit(1);
    if (ex) {
      handoverId = ex.id;
    } else {
      const [ins] = await db.insert(schema.handovers).values({
        handover_number: h.handover_number,
        entity_type: h.entity_type,
        reason: h.reason,
        status: h.status,
        outgoing_rm_id: outRmId,
        incoming_rm_id: inRmId,
        outgoing_rm_name: 'Jose dela Cruz',
        incoming_rm_name: 'Ana Mendoza',
        authorized_by: h.status === 'authorized' ? refs.headUserId : null,
        authorized_at: h.status === 'authorized' ? new Date('2026-02-01') : null,
        sla_deadline: new Date(Date.now() + 48 * 3600 * 1000),
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      }).returning();
      handoverId = ins.id;
      hovSeeded++;

      // Audit log (only for newly created handovers)
      await db.insert(schema.handoverAuditLog).values({
        event_type: h.status === 'authorized' ? 'handover_authorized' : 'handover_created',
        reference_type: 'handover',
        reference_id: handoverId,
        actor_id: refs.headUserId,
        actor_role: 'bo_head',
        details: { handover_number: h.handover_number, action: h.status },
      });
      auditSeeded++;
    }
    handoverIds.push(handoverId);

    // Seed handover item (idempotent — skip if entity already has an active item)
    const [exItem] = await db.select().from(schema.handoverItems)
      .where(sql`entity_id = ${h.itemEntityId}`).limit(1);
    if (!exItem) {
      const [item] = await db.insert(schema.handoverItems).values({
        handover_id: handoverId,
        entity_id: h.itemEntityId,
        entity_name_en: `Client ${h.itemEntityId}`,
        previous_rm_id: outRmId,
        aum_at_handover: '5000000',
        status: h.itemStatus,
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      }).returning();
      itemSeeded++;

      // Compliance gate for this item
      await db.insert(schema.complianceGates).values({
        handover_id: handoverId,
        handover_item_id: item.id,
        gate_type: 'kyc_pending',
        result: h.status === 'authorized' ? 'passed' : 'warning',
        details: 'KYC verified and up to date',
        checked_at: new Date(),
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      });
      gateSeeded++;
    }

    // Scrutiny checklist (idempotent)
    for (const tid of refs.scrutinyTemplateIds.slice(0, 3)) {
      const [exSc] = await db.select().from(schema.scrutinyChecklistItems)
        .where(sql`handover_id = ${handoverId} AND template_item_id = ${tid}`).limit(1);
      if (!exSc) {
        await db.insert(schema.scrutinyChecklistItems).values({
          handover_id: handoverId,
          template_item_id: tid,
          validation_label: 'Checklist item validated',
          status: h.status === 'authorized' ? 'completed' : 'pending',
          created_by_user_id: SYSTEM_USER,
          updated_by_user_id: SYSTEM_USER,
        });
        scrutinySeeded++;
      }
    }
  }
  console.log(`  → ${hovSeeded} handovers, ${itemSeeded} items, ${scrutinySeeded} scrutiny, ${gateSeeded} gates, ${auditSeeded} audit logs seeded`);
  return handoverIds;
}

// ── 14. Delegation Requests ───────────────────────────────────────────────────

async function seedDelegations(refs: Refs) {
  console.log('[14] Seeding delegation_requests, delegation_items...');
  const outRmId = refs.userIds[0];
  const delRmId = refs.userIds[1];

  const [ex] = await db.select().from(schema.delegationRequests)
    .where(sql`outgoing_rm_id = ${outRmId} AND delegate_rm_id = ${delRmId}`).limit(1);
  if (ex) {
    console.log('  → delegation already seeded');
    return;
  }

  const [del] = await db.insert(schema.delegationRequests).values({
    outgoing_rm_id: outRmId,
    outgoing_rm_name: 'Jose dela Cruz',
    delegate_rm_id: delRmId,
    delegate_rm_name: 'Ana Mendoza',
    delegation_reason: 'Annual leave — April 28 to May 9 2026',
    start_date: '2026-04-28',
    end_date: '2026-05-09',
    delegation_type: 'client',
    status: 'active',
    created_by_user_id: SYSTEM_USER,
    updated_by_user_id: SYSTEM_USER,
  }).returning();

  // Delegation items
  for (let i = 0; i < 2; i++) {
    await db.insert(schema.delegationItems).values({
      delegation_request_id: del.id,
      entity_type: 'client',
      entity_id: refs.clientIds[i],
      entity_name: `Client ${refs.clientIds[i]}`,
      original_rm_id: outRmId,
      created_by_user_id: SYSTEM_USER,
      updated_by_user_id: SYSTEM_USER,
    });
  }

  // Audit log
  await db.insert(schema.handoverAuditLog).values({
    event_type: 'delegation_created',
    reference_type: 'delegation',
    reference_id: del.id,
    actor_id: refs.headUserId,
    actor_role: 'bo_head',
    details: { delegation_id: del.id, reason: del.delegation_reason },
  });

  console.log(`  → 1 delegation request, 2 items seeded`);
}

// ── 15. DSAR Requests ─────────────────────────────────────────────────────────

async function seedDsarRequests(refs: Refs) {
  console.log('[15] Seeding dsar_requests...');
  const rows = [
    { request_type: 'ACCESS', requestor_name: 'Ricardo M. Santos', requestor_email: 'r.santos@email.com', subject_client_id: refs.clientIds[0], description: 'Request for all personal data held by the bank.', dsar_status: 'PROCESSING' as const, response_deadline: '2026-05-27' },
    { request_type: 'ERASURE', requestor_name: 'Elena D. Reyes', requestor_email: 'e.reyes@email.com', subject_client_id: refs.clientIds[1], description: 'Request to delete marketing preferences.', dsar_status: 'NEW' as const, response_deadline: '2026-05-27' },
    { request_type: 'RECTIFICATION', requestor_name: 'Antonio P. Cruz', requestor_email: 'a.cruz@email.com', subject_client_id: refs.clientIds[2], description: 'Correct address on file.', dsar_status: 'COMPLETED' as const, response_deadline: '2026-04-27' },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.dsarRequests)
      .where(sql`requestor_email = ${r.requestor_email} AND request_type = ${r.request_type}`).limit(1);
    if (!ex) {
      await db.insert(schema.dsarRequests).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} DSAR requests seeded`);
}

// ── 16. Approval Requests ─────────────────────────────────────────────────────

async function seedApprovalRequests(refs: Refs) {
  console.log('[16] Seeding approval_requests...');
  const rows = [
    { entity_type: 'handover', entity_id: 'HOV-2026-001', action: 'AUTHORIZE', approval_status: 'APPROVED' as const, payload: { handover_number: 'HOV-2026-001' }, submitted_by: refs.userIds[0] },
    { entity_type: 'investment_proposal', entity_id: 'PROP-2026-003', action: 'L1_APPROVE', approval_status: 'APPROVED' as const, payload: { proposal_number: 'PROP-2026-003' }, submitted_by: refs.headUserId },
    { entity_type: 'questionnaire', entity_id: '1', action: 'AUTHORIZE', approval_status: 'PENDING' as const, payload: { questionnaire_id: 1 }, submitted_by: refs.userIds[2] ?? refs.userIds[0] },
  ];
  let seeded = 0;
  for (const r of rows) {
    const [ex] = await db.select().from(schema.approvalRequests)
      .where(sql`entity_type = ${r.entity_type} AND entity_id = ${r.entity_id} AND action = ${r.action}`).limit(1);
    if (!ex) {
      await db.insert(schema.approvalRequests).values({
        ...r,
        reviewed_by: r.approval_status === 'APPROVED' ? refs.headUserId : null,
        reviewed_at: r.approval_status === 'APPROVED' ? new Date('2026-02-05') : null,
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      });
      seeded++;
    }
  }
  console.log(`  → ${seeded} approval requests seeded`);
}

// ── 17. Service Request Documents ────────────────────────────────────────────

async function seedSrDocuments(refs: Refs) {
  console.log('[17] Seeding service_request_documents...');
  if (refs.srIds.length === 0) { console.log('  → no service requests found, skip'); return; }
  const docs = [
    { sr_id: refs.srIds[0], document_name: 'Valid ID — Philippine Passport', document_class: 'KYC' as const, mime_type: 'application/pdf', file_size_bytes: 204800, scan_status: 'CLEAN' as const, uploaded_by_type: 'RM' as const, uploaded_by_id: refs.headUserId },
    { sr_id: refs.srIds[0], document_name: 'Proof of Address — Utility Bill', document_class: 'KYC' as const, mime_type: 'image/jpeg', file_size_bytes: 102400, scan_status: 'CLEAN' as const, uploaded_by_type: 'RM' as const, uploaded_by_id: refs.headUserId },
    { sr_id: refs.srIds[1], document_name: 'New Address Certificate', document_class: 'OTHER' as const, mime_type: 'application/pdf', file_size_bytes: 51200, scan_status: 'CLEAN' as const, uploaded_by_type: 'RM' as const, uploaded_by_id: refs.userIds[2] ?? refs.headUserId },
  ];
  let seeded = 0;
  for (const d of docs) {
    const [ex] = await db.select().from(schema.serviceRequestDocuments)
      .where(sql`sr_id = ${d.sr_id} AND document_name = ${d.document_name}`).limit(1);
    if (!ex) {
      await db.insert(schema.serviceRequestDocuments).values({ ...d, retention_days: 2555 });
      seeded++;
    }
  }
  console.log(`  → ${seeded} SR documents seeded`);
}

// ── 18. SR Status History ─────────────────────────────────────────────────────

async function seedSrStatusHistory(refs: Refs) {
  console.log('[18] Seeding sr_status_history...');
  if (refs.srIds.length === 0) { console.log('  → no service requests found, skip'); return; }
  const histRows = [
    { sr_id: refs.srIds[0], from_status: null, to_status: 'NEW' as const, action: 'CREATED' as const, changed_by: 'system', notes: 'SR created by client portal' },
    { sr_id: refs.srIds[0], from_status: 'NEW' as const, to_status: 'APPROVED' as const, action: 'STATUS_CHANGE' as const, changed_by: 'bo_head', notes: 'Approved by supervisor' },
    { sr_id: refs.srIds[1], from_status: null, to_status: 'NEW' as const, action: 'CREATED' as const, changed_by: 'system', notes: 'SR created' },
  ];
  let seeded = 0;
  for (const h of histRows) {
    const [ex] = await db.select().from(schema.srStatusHistory)
      .where(sql`sr_id = ${h.sr_id} AND to_status = ${h.to_status} AND action = ${h.action}`).limit(1);
    if (!ex) {
      await db.insert(schema.srStatusHistory).values(h);
      seeded++;
    }
  }
  console.log(`  → ${seeded} SR status history entries seeded`);
}

// ── 19. Client Statements ─────────────────────────────────────────────────────

async function seedClientStatements(refs: Refs) {
  console.log('[19] Seeding client_statements...');
  const periods = ['2026-01', '2026-02', '2026-03'];
  const types = ['MONTHLY', 'QUARTERLY'];
  let seeded = 0;
  for (const cid of refs.clientIds.slice(0, 4)) {
    for (const period of periods) {
      for (const stype of types.slice(0, 1)) {
        const [ex] = await db.select().from(schema.clientStatements)
          .where(sql`client_id = ${cid} AND period = ${period} AND statement_type = ${stype}`).limit(1);
        if (!ex) {
          await db.insert(schema.clientStatements).values({
            client_id: cid,
            period,
            statement_type: stype,
            delivery_status: 'AVAILABLE',
            file_reference: `statements/${cid}/${period}/statement.pdf`,
            file_size_bytes: 204800,
            download_count: 0,
            generated_at: new Date(`${period}-15`),
          });
          seeded++;
        }
      }
    }
    // One quarterly statement
    const [exQ] = await db.select().from(schema.clientStatements)
      .where(sql`client_id = ${cid} AND period = '2026-Q1' AND statement_type = 'QUARTERLY'`).limit(1);
    if (!exQ) {
      await db.insert(schema.clientStatements).values({
        client_id: cid,
        period: '2026-Q1',
        statement_type: 'QUARTERLY',
        delivery_status: 'AVAILABLE',
        file_reference: `statements/${cid}/2026-Q1/quarterly.pdf`,
        file_size_bytes: 512000,
        download_count: 1,
        generated_at: new Date('2026-04-05'),
      });
      seeded++;
    }
  }
  console.log(`  → ${seeded} client statements seeded`);
}

// ── 20. Client Messages ───────────────────────────────────────────────────────

async function seedClientMessages(refs: Refs) {
  console.log('[20] Seeding client_messages...');
  const msgs = [
    { thread_id: 'THR-001', sender_id: refs.headUserId, sender_type: 'RM' as const, recipient_client_id: refs.clientIds[0], subject: 'Welcome to TrustBank Philippines', body: 'Dear valued client,\n\nWelcome to TrustBank Philippines. Your account is now active and ready for investments.', is_read: true },
    { thread_id: 'THR-001', sender_id: refs.headUserId, sender_type: 'RM' as const, recipient_client_id: refs.clientIds[0], subject: null, body: 'Please review your risk profile at your earliest convenience.', is_read: false },
    { thread_id: 'THR-002', sender_id: refs.headUserId, sender_type: 'RM' as const, recipient_client_id: refs.clientIds[1], subject: 'Investment Proposal Ready', body: 'Dear client,\n\nYour investment proposal PROP-2026-002 is ready for review. Please log in to your portal.', is_read: false },
    { thread_id: 'THR-003', sender_id: refs.headUserId, sender_type: 'RM' as const, recipient_client_id: refs.clientIds[2], subject: 'KYC Renewal Reminder', body: 'Your KYC documents are due for renewal. Please submit updated documents.', is_read: false },
    { thread_id: 'THR-004', sender_id: refs.headUserId, sender_type: 'RM' as const, recipient_client_id: refs.clientIds[3], subject: 'Market Update — April 2026', body: 'Please find attached the monthly market update for April 2026.', is_read: true },
  ];
  let seeded = 0;
  for (const m of msgs) {
    const [ex] = await db.select().from(schema.clientMessages)
      .where(sql`thread_id = ${m.thread_id} AND body = ${m.body}`).limit(1);
    if (!ex) {
      await db.insert(schema.clientMessages).values({ ...m, sent_at: new Date() });
      seeded++;
    }
  }
  console.log(`  → ${seeded} client messages seeded`);
}

// ── 21. Feed Health Snapshots ─────────────────────────────────────────────────

async function seedFeedHealthSnapshots() {
  console.log('[21] Seeding feed_health_snapshots...');
  const feeds = [
    { feed_name: 'BLOOMBERG', health_score: 98, status: 'UP' as const, failure_count: 0 },
    { feed_name: 'REUTERS', health_score: 100, status: 'UP' as const, failure_count: 0 },
    { feed_name: 'PSE', health_score: 95, status: 'UP' as const, failure_count: 1, last_error: 'Timeout on batch 3' },
    { feed_name: 'BSP_FX', health_score: 100, status: 'UP' as const, failure_count: 0 },
    { feed_name: 'SWIFT', health_score: 72, status: 'DEGRADED' as const, failure_count: 5, last_error: 'SWIFT network latency' },
    { feed_name: 'ISIN_MASTER', health_score: 100, status: 'UP' as const, failure_count: 0 },
  ];
  let seeded = 0;
  for (const f of feeds) {
    const [ex] = await db.select().from(schema.feedHealthSnapshots)
      .where(eq(schema.feedHealthSnapshots.feed_name, f.feed_name)).limit(1);
    if (!ex) {
      await db.insert(schema.feedHealthSnapshots).values({ ...f, last_updated: new Date() });
      seeded++;
    }
  }
  console.log(`  → ${seeded} feed health snapshots seeded`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS — Group B: Feature Demo Data Seed                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@')}`);

  // Verify DB connection
  await db.execute(sql`SELECT 1`);
  console.log('[DB] Connection verified');

  const refs = await loadRefs();
  console.log(`[DB] Loaded refs: ${refs.clientIds.length} clients, ${refs.userIds.length} users, ${refs.srIds.length} SRs`);

  await seedBeneficialOwners(refs);
  await seedClientFatcaCrs(refs);
  await seedDocumentDeficiencies(refs);
  await seedConsentRecords(refs);
  await seedHeldAwayAssets(refs);
  await seedStandingInstructions(refs);
  await seedScheduledPlans(refs);
  await seedPeraData(refs);
  const profileIds = await seedRiskProfiles(refs);
  await seedInvestmentProposals(refs, profileIds);
  await seedComplianceEscalations(refs, profileIds);
  await seedRiskProfilingAuditLogs(refs, profileIds);
  await seedHandovers(refs);
  await seedDelegations(refs);
  await seedDsarRequests(refs);
  await seedApprovalRequests(refs);
  await seedSrDocuments(refs);
  await seedSrStatusHistory(refs);
  await seedClientStatements(refs);
  await seedClientMessages(refs);
  await seedFeedHealthSnapshots();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Group B seed completed successfully!                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('[ERROR] Group B seed failed:', err?.message ?? err); process.exit(1); });
}
