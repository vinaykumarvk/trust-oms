/**
 * seed-group-a.ts — Group A: Reference / Config tables
 *
 * Covers all reference and configuration tables required for features to work.
 * Safe to run repeatedly — uses skip-if-exists patterns.
 *
 * Run order:
 *  1.  system_config
 *  2.  notification_templates
 *  3.  sla_configurations
 *  4.  approval_workflow_definitions
 *  5.  roles / permissions / user_roles
 *  6.  GL categories → hierarchy → heads → access_codes → accounting_units
 *  7.  fund_master → gl_portfolio_master → gl_counterparty_master
 *  8.  frpti_mappings, fs_mapping, reval_parameters
 *  9.  gl_event_definitions → criteria → conditions → rule_sets → entry_defs
 *  10. gl_rule_test_cases, gl_authorization_matrix
 *  11. gl_financial_years → gl_financial_periods
 *  12. gl_report_definitions, report_pack_templates
 *  13. fx_rates
 *  14. compliance_limits
 *  15. dedupe_rules, negative_list
 *  16. content_packs
 *  17. regulatory_calendar
 *  18. scrutiny_templates
 *  19. questionnaires → questions → answer_options → score_normalization_ranges
 *  20. risk_appetite_mappings → risk_appetite_bands
 *  21. asset_allocation_configs → asset_allocation_lines
 *  22. rp_model_portfolios
 *  23. model_portfolios
 */

import 'dotenv/config';
import { db } from '../db';
import * as schema from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import { fileURLToPath } from 'url';

const SYSTEM_USER = 1; // admin user id
const NOW = new Date();

function d(offset = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().slice(0, 10);
}

async function getUserId(): Promise<number> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, 'admin')).limit(1);
  return u?.id ?? 1;
}

async function getJurisdictionId(): Promise<number | undefined> {
  const [j] = await db.select().from(schema.jurisdictions).limit(1);
  return j?.id;
}

// ── 1. system_config ─────────────────────────────────────────────────────────

async function seedSystemConfig() {
  console.log('[1] Seeding system_config...');
  const entries = [
    { config_key: 'MAX_CALL_REPORT_DAYS', config_value: '5', description: 'Max days to submit call report after meeting', value_type: 'INTEGER' },
    { config_key: 'KYC_REVIEW_PERIOD_YEARS', config_value: '2', description: 'KYC review period in years', value_type: 'INTEGER' },
    { config_key: 'RISK_PROFILE_VALIDITY_YEARS', config_value: '2', description: 'Risk profile validity in years', value_type: 'INTEGER' },
    { config_key: 'SESSION_TIMEOUT_MINUTES', config_value: '30', description: 'Idle session timeout', value_type: 'INTEGER' },
    { config_key: 'MAX_LOGIN_ATTEMPTS', config_value: '5', description: 'Max consecutive failed login attempts', value_type: 'INTEGER' },
    { config_key: 'PASSWORD_EXPIRY_DAYS', config_value: '90', description: 'Password expiry in days', value_type: 'INTEGER' },
    { config_key: 'DSAR_RESPONSE_DAYS', config_value: '30', description: 'DSAR response deadline in days', value_type: 'INTEGER' },
    { config_key: 'DEVIATION_WINDOW_DAYS', config_value: '180', description: 'Window to count repeat deviations for escalation', value_type: 'INTEGER' },
    { config_key: 'DEVIATION_ESCALATION_THRESHOLD', config_value: '3', description: 'Repeat deviations before auto-escalation', value_type: 'INTEGER' },
    { config_key: 'PROPOSAL_EXPIRY_DAYS', config_value: '30', description: 'Investment proposal validity in days', value_type: 'INTEGER' },
    { config_key: 'ENABLE_AUDIT_TRAIL', config_value: 'true', description: 'Enable full audit trail logging', value_type: 'BOOLEAN' },
    { config_key: 'ENABLE_SANCTIONS_SCREENING', config_value: 'true', description: 'Enable real-time sanctions screening', value_type: 'BOOLEAN' },
    { config_key: 'ENABLE_DEDUPE_CHECK', config_value: 'true', description: 'Enable duplicate detection for leads/prospects', value_type: 'BOOLEAN' },
    { config_key: 'MIN_AUM_FOR_PERA', config_value: '10000', description: 'Minimum AUM to be eligible for PERA', value_type: 'DECIMAL' },
    { config_key: 'MAX_PERA_ANNUAL_CONTRIBUTION', config_value: '100000', description: 'Max annual PERA contribution (PHP)', value_type: 'DECIMAL' },
    { config_key: 'GL_DAILY_REVAL_ENABLED', config_value: 'true', description: 'Enable daily FX revaluation for GL', value_type: 'BOOLEAN' },
    { config_key: 'FRPTI_REPORTING_ENTITY', config_value: 'TRUSTBANK_PH', description: 'FRPTI reporting entity code', value_type: 'STRING' },
    { config_key: 'BASE_CURRENCY', config_value: 'PHP', description: 'System base currency', value_type: 'STRING' },
    { config_key: 'FEED_HEALTH_STALE_MINUTES', config_value: '60', description: 'Feed considered stale after N minutes', value_type: 'INTEGER' },
    { config_key: 'BULK_UPLOAD_MAX_ROWS', config_value: '5000', description: 'Max rows in a single bulk upload', value_type: 'INTEGER' },
  ];
  let seeded = 0;
  for (const e of entries) {
    const [existing] = await db.select().from(schema.systemConfig).where(eq(schema.systemConfig.config_key, e.config_key)).limit(1);
    if (!existing) {
      await db.insert(schema.systemConfig).values({
        ...e,
        created_by_user_id: SYSTEM_USER,
        updated_by_user_id: SYSTEM_USER,
      });
      seeded++;
    }
  }
  console.log(`  → ${seeded} config entries seeded`);
}

// ── 2. notification_templates ─────────────────────────────────────────────────

async function seedNotificationTemplates() {
  console.log('[2] Seeding notification_templates...');
  const templates = [
    { template_code: 'HANDOVER_INITIATED', name: 'Handover Initiated', channel: 'EMAIL' as const, subject_template: 'Client Handover Initiated — {{handover_number}}', body_template: 'Dear {{recipient_name}},\n\nA client handover {{handover_number}} has been initiated by {{outgoing_rm_name}} to {{incoming_rm_name}}.\n\nPlease review and authorize in the TrustOMS system.\n\nRegards,\nTrustOMS System' },
    { template_code: 'HANDOVER_AUTHORIZED', name: 'Handover Authorized', channel: 'EMAIL' as const, subject_template: 'Handover {{handover_number}} Authorized', body_template: 'Dear {{recipient_name}},\n\nHandover {{handover_number}} has been authorized.\n\nEffective Date: {{effective_date}}\n\nRegards,\nTrustOMS System' },
    { template_code: 'HANDOVER_REJECTED', name: 'Handover Rejected', channel: 'EMAIL' as const, subject_template: 'Handover {{handover_number}} Rejected', body_template: 'Dear {{recipient_name}},\n\nHandover {{handover_number}} has been rejected.\n\nReason: {{rejection_reason}}\n\nRegards,\nTrustOMS System' },
    { template_code: 'DELEGATION_STARTED', name: 'Delegation Started', channel: 'EMAIL' as const, subject_template: 'Delegation Period Started — {{delegation_ref}}', body_template: 'Dear {{recipient_name}},\n\nYour delegation to {{delegate_rm_name}} has started.\n\nPeriod: {{start_date}} to {{end_date}}\n\nRegards,\nTrustOMS System' },
    { template_code: 'DELEGATION_EXPIRING', name: 'Delegation Expiring Soon', channel: 'EMAIL' as const, subject_template: 'Delegation Expiring in 3 Days — {{delegation_ref}}', body_template: 'Dear {{recipient_name}},\n\nYour delegation expires in 3 days on {{end_date}}.\n\nPlease take action if an extension is required.\n\nRegards,\nTrustOMS System' },
    { template_code: 'CALL_REPORT_OVERDUE', name: 'Call Report Overdue', channel: 'EMAIL' as const, subject_template: 'Action Required: Call Report Overdue for {{meeting_code}}', body_template: 'Dear {{rm_name}},\n\nYour call report for meeting {{meeting_code}} on {{meeting_date}} is overdue. Please submit within 24 hours.\n\nRegards,\nTrustOMS Compliance Team' },
    { template_code: 'KYC_EXPIRY_REMINDER', name: 'KYC Expiry Reminder', channel: 'EMAIL' as const, subject_template: 'KYC Review Due — {{client_name}}', body_template: 'Dear {{rm_name}},\n\nThe KYC for client {{client_name}} ({{client_id}}) is due for review on {{expiry_date}}.\n\nPlease initiate the KYC renewal process.\n\nRegards,\nTrustOMS Compliance Team' },
    { template_code: 'PROPOSAL_SENT', name: 'Investment Proposal Sent to Client', channel: 'EMAIL' as const, subject_template: 'Investment Proposal Ready — {{proposal_number}}', body_template: 'Dear {{client_name}},\n\nYour investment proposal {{proposal_number}} is ready for review.\n\nProposed Amount: {{proposed_amount}} {{currency}}\nObjective: {{investment_objective}}\n\nPlease log in to your client portal to review and accept/reject.\n\nRegards,\n{{rm_name}}\nTrust Banking' },
    { template_code: 'DSAR_RECEIVED', name: 'DSAR Acknowledgement', channel: 'EMAIL' as const, subject_template: 'Data Subject Access Request Received — Ref: {{dsar_ref}}', body_template: 'Dear {{requestor_name}},\n\nWe have received your data subject request.\n\nReference: {{dsar_ref}}\nDeadline: {{response_deadline}}\n\nWe will process your request within the statutory period.\n\nRegards,\nData Protection Officer\nTrustBank Philippines' },
    { template_code: 'SR_APPROVED', name: 'Service Request Approved', channel: 'EMAIL' as const, subject_template: 'Service Request {{sr_number}} Approved', body_template: 'Dear {{client_name}},\n\nYour service request {{sr_number}} has been approved and is being processed.\n\nExpected completion: {{expected_completion}}\n\nRegards,\nTrustBank Customer Service' },
    { template_code: 'CAMPAIGN_INVITE', name: 'Campaign Invitation', channel: 'EMAIL' as const, subject_template: '{{campaign_name}} — Exclusive Invitation', body_template: 'Dear {{lead_name}},\n\nWe would like to invite you to {{campaign_name}}.\n\n{{campaign_description}}\n\nTo learn more, please contact your relationship manager.\n\nRegards,\nTrustBank Philippines' },
    { template_code: 'RISK_PROFILE_EXPIRY', name: 'Risk Profile Expiry', channel: 'SMS' as const, body_template: 'TrustBank: Your risk profile expires on {{expiry_date}}. Please contact your RM {{rm_name}} to schedule a review.' },
  ];
  let seeded = 0;
  for (const t of templates) {
    const [existing] = await db.select().from(schema.notificationTemplates).where(eq(schema.notificationTemplates.template_code, t.template_code)).limit(1);
    if (!existing) {
      await db.insert(schema.notificationTemplates).values({ ...t, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} templates seeded`);
}

// ── 3. sla_configurations ─────────────────────────────────────────────────────

async function seedSlaConfigurations() {
  console.log('[3] Seeding sla_configurations...');
  const entries = [
    { entity_type: 'lead' as const, warning_hours: 24, deadline_hours: 48, escalation_hours: 72 },
    { entity_type: 'prospect' as const, warning_hours: 24, deadline_hours: 48, escalation_hours: 72 },
    { entity_type: 'client' as const, warning_hours: 48, deadline_hours: 72, escalation_hours: 96 },
  ];
  let seeded = 0;
  for (const e of entries) {
    const [existing] = await db.select().from(schema.slaConfigurations).where(eq(schema.slaConfigurations.entity_type, e.entity_type)).limit(1);
    if (!existing) {
      await db.insert(schema.slaConfigurations).values({ ...e, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
      seeded++;
    }
  }
  console.log(`  → ${seeded} SLA configs seeded`);
}

// ── 4. approval_workflow_definitions ─────────────────────────────────────────

async function seedApprovalWorkflows() {
  console.log('[4] Seeding approval_workflow_definitions...');
  const workflows = [
    { entity_type: 'handover', action: 'AUTHORIZE', required_approvers: 1, sla_hours: 48, auto_approve_roles: ['bo_admin'] },
    { entity_type: 'delegation', action: 'AUTHORIZE', required_approvers: 1, sla_hours: 24, auto_approve_roles: ['bo_admin'] },
    { entity_type: 'investment_proposal', action: 'L1_APPROVE', required_approvers: 1, sla_hours: 24, auto_approve_roles: [] },
    { entity_type: 'investment_proposal', action: 'COMPLIANCE_APPROVE', required_approvers: 1, sla_hours: 48, auto_approve_roles: [] },
    { entity_type: 'dsar_request', action: 'PROCESS', required_approvers: 1, sla_hours: 720, auto_approve_roles: [] },
    { entity_type: 'gl_journal_batch', action: 'AUTHORIZE', required_approvers: 1, sla_hours: 4, auto_approve_roles: [] },
    { entity_type: 'gl_reversal', action: 'AUTHORIZE', required_approvers: 2, sla_hours: 8, auto_approve_roles: [] },
    { entity_type: 'questionnaire', action: 'AUTHORIZE', required_approvers: 1, sla_hours: 48, auto_approve_roles: ['bo_admin'] },
    { entity_type: 'service_request', action: 'APPROVE', required_approvers: 1, sla_hours: 24, auto_approve_roles: [] },
  ];
  let seeded = 0;
  for (const w of workflows) {
    await db.insert(schema.approvalWorkflowDefinitions).values({
      ...w,
      auto_approve_roles: w.auto_approve_roles,
      is_active: true,
      created_by_user_id: SYSTEM_USER,
      updated_by_user_id: SYSTEM_USER,
    });
    seeded++;
  }
  console.log(`  → ${seeded} workflow definitions seeded`);
}

// ── 5. roles / permissions / user_roles ──────────────────────────────────────

async function seedRbac() {
  console.log('[5] Seeding roles, permissions, user_roles...');

  // roles.name (not role_name) — matches schema
  const roleList = [
    { name: 'bo_admin', office: 'back_office', description: 'Back Office Administrator — full system access' },
    { name: 'bo_head', office: 'back_office', description: 'Back Office Head — operations head with approval rights' },
    { name: 'bo_maker', office: 'back_office', description: 'Back Office Maker — data entry and initiation' },
    { name: 'bo_checker', office: 'back_office', description: 'Back Office Checker — review and authorize' },
    { name: 'relationship_manager', office: 'front_office', description: 'Relationship Manager — client-facing CRM access' },
    { name: 'client_portal', office: 'client', description: 'Client Portal — self-service portal access' },
    { name: 'compliance_officer', office: 'back_office', description: 'Compliance Officer — compliance and audit access' },
    { name: 'risk_officer', office: 'back_office', description: 'Risk Officer — risk analytics and profiling' },
    { name: 'tco', office: 'back_office', description: 'Trust Compliance Officer — regulatory compliance' },
    { name: 'regulator', office: 'back_office', description: 'Regulator — read-only regulatory view' },
  ];

  let rolesSeeded = 0;
  const roleIds: Record<string, number> = {};
  for (const r of roleList) {
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.name, r.name)).limit(1);
    if (existing) {
      roleIds[r.name] = existing.id;
    } else {
      const [inserted] = await db.insert(schema.roles).values({ ...r, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER }).returning();
      roleIds[r.name] = inserted.id;
      rolesSeeded++;
    }
  }

  // permissions: role_id + resource + action (no permission_name column)
  const permsByRole: Record<string, Array<{ resource: string; action: string }>> = {
    bo_admin: [
      { resource: 'clients', action: 'READ' }, { resource: 'clients', action: 'WRITE' },
      { resource: 'portfolios', action: 'READ' }, { resource: 'portfolios', action: 'WRITE' },
      { resource: 'gl', action: 'READ' }, { resource: 'gl', action: 'WRITE' }, { resource: 'gl', action: 'AUTHORIZE' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'risk_profiling', action: 'WRITE' }, { resource: 'risk_profiling', action: 'AUTHORIZE' },
      { resource: 'handovers', action: 'READ' }, { resource: 'handovers', action: 'AUTHORIZE' },
      { resource: 'crm', action: 'READ' }, { resource: 'crm', action: 'WRITE' },
      { resource: 'reports', action: 'READ' },
      { resource: 'system_config', action: 'READ' }, { resource: 'system_config', action: 'WRITE' },
      { resource: 'audit', action: 'READ' },
    ],
    bo_head: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'gl', action: 'AUTHORIZE' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'risk_profiling', action: 'AUTHORIZE' },
      { resource: 'handovers', action: 'READ' }, { resource: 'handovers', action: 'AUTHORIZE' },
      { resource: 'reports', action: 'READ' }, { resource: 'audit', action: 'READ' },
    ],
    bo_maker: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'gl', action: 'WRITE' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'reports', action: 'READ' },
    ],
    bo_checker: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'gl', action: 'AUTHORIZE' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'reports', action: 'READ' },
    ],
    relationship_manager: [
      { resource: 'clients', action: 'READ' }, { resource: 'clients', action: 'WRITE' },
      { resource: 'portfolios', action: 'READ' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'risk_profiling', action: 'WRITE' },
      { resource: 'crm', action: 'READ' }, { resource: 'crm', action: 'WRITE' },
      { resource: 'reports', action: 'READ' },
    ],
    compliance_officer: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'risk_profiling', action: 'READ' },
      { resource: 'handovers', action: 'READ' }, { resource: 'audit', action: 'READ' },
      { resource: 'reports', action: 'READ' },
    ],
    risk_officer: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'risk_profiling', action: 'READ' }, { resource: 'risk_profiling', action: 'WRITE' },
      { resource: 'reports', action: 'READ' }, { resource: 'audit', action: 'READ' },
    ],
    tco: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'risk_profiling', action: 'READ' },
      { resource: 'reports', action: 'READ' }, { resource: 'audit', action: 'READ' },
    ],
    regulator: [
      { resource: 'clients', action: 'READ' }, { resource: 'portfolios', action: 'READ' },
      { resource: 'gl', action: 'READ' }, { resource: 'reports', action: 'READ' },
    ],
  };

  let permsSeeded = 0;
  for (const [roleName, perms] of Object.entries(permsByRole)) {
    const roleId = roleIds[roleName];
    if (!roleId) continue;
    for (const p of perms) {
      const [existing] = await db.select().from(schema.permissions)
        .where(sql`role_id = ${roleId} AND resource = ${p.resource} AND action = ${p.action}`).limit(1);
      if (!existing) {
        await db.insert(schema.permissions).values({ role_id: roleId, ...p, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
        permsSeeded++;
      }
    }
  }

  // Assign roles to existing users based on their users.role text field
  const users = await db.select().from(schema.users);
  let userRolesSeeded = 0;
  for (const user of users) {
    const roleId = roleIds[user.role ?? ''];
    if (roleId) {
      const [existing] = await db.select().from(schema.userRoles)
        .where(sql`user_id = ${user.id} AND role_id = ${roleId}`).limit(1);
      if (!existing) {
        await db.insert(schema.userRoles).values({ user_id: user.id, role_id: roleId, created_by_user_id: SYSTEM_USER, updated_by_user_id: SYSTEM_USER });
        userRolesSeeded++;
      }
    }
  }

  console.log(`  → ${rolesSeeded} roles, ${permsSeeded} permissions, ${userRolesSeeded} user_roles seeded`);
}

// ── 6. GL Categories → Hierarchy → Heads → Access Codes → Accounting Units ──

async function seedGlStructure(userId: number) {
  console.log('[6] Seeding GL categories, hierarchy, heads, access codes, accounting units...');

  // GL Categories
  const catData = [
    { code: 'ASSET', name: 'Assets', concise_name: 'Assets', category_type: 'ASSET' as const, is_bank_gl: true },
    { code: 'LIABILITY', name: 'Liabilities', concise_name: 'Liabilities', category_type: 'LIABILITY' as const, is_bank_gl: true },
    { code: 'INCOME', name: 'Income / Revenue', concise_name: 'Income', category_type: 'INCOME' as const },
    { code: 'EXPENDITURE', name: 'Expenditure / Expenses', concise_name: 'Expenses', category_type: 'EXPENDITURE' as const },
    { code: 'EQUITY', name: 'Equity / Capital', concise_name: 'Equity', category_type: 'EQUITY' as const },
  ];
  const catIds: Record<string, number> = {};
  let catSeeded = 0;
  for (const c of catData) {
    const [ex] = await db.select().from(schema.glCategories).where(eq(schema.glCategories.code, c.code)).limit(1);
    if (ex) { catIds[c.code] = ex.id; }
    else {
      const [ins] = await db.insert(schema.glCategories).values({ ...c, created_by_user_id: userId, updated_by_user_id: userId }).returning();
      catIds[c.code] = ins.id; catSeeded++;
    }
  }

  // GL Hierarchy
  const hierData = [
    { code: 'BS', name: 'Balance Sheet', level: 0, sort_order: 1 },
    { code: 'IS', name: 'Income Statement', level: 0, sort_order: 2 },
    { code: 'BS_CURR_ASSETS', name: 'Current Assets', level: 1, sort_order: 1, parent_code: 'BS' },
    { code: 'BS_FIXED_ASSETS', name: 'Fixed Assets', level: 1, sort_order: 2, parent_code: 'BS' },
    { code: 'BS_CURR_LIAB', name: 'Current Liabilities', level: 1, sort_order: 3, parent_code: 'BS' },
    { code: 'BS_EQUITY', name: 'Equity', level: 1, sort_order: 4, parent_code: 'BS' },
    { code: 'IS_REVENUE', name: 'Revenue', level: 1, sort_order: 1, parent_code: 'IS' },
    { code: 'IS_EXPENSE', name: 'Expenses', level: 1, sort_order: 2, parent_code: 'IS' },
  ];
  const hierIds: Record<string, number> = {};
  for (const h of hierData) {
    const [ex] = await db.select().from(schema.glHierarchy).where(eq(schema.glHierarchy.code, h.code)).limit(1);
    if (ex) { hierIds[h.code] = ex.id; }
    else {
      const parentId = h.parent_code ? hierIds[h.parent_code] : undefined;
      const [ins] = await db.insert(schema.glHierarchy).values({
        code: h.code, name: h.name, level: h.level, sort_order: h.sort_order,
        parent_hierarchy_id: parentId ?? null,
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      hierIds[h.code] = ins.id;
    }
  }

  // GL Heads (chart of accounts)
  const headData = [
    { code: '10100', name: 'Cash on Hand', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_CURR_ASSETS', opening_date: '2020-01-01' },
    { code: '10200', name: 'Trust Fund Assets — PHP', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_CURR_ASSETS', opening_date: '2020-01-01' },
    { code: '10300', name: 'Investment Securities', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_FIXED_ASSETS', opening_date: '2020-01-01', is_revaluation_enabled: true },
    { code: '10400', name: 'Accrued Interest Receivable', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_CURR_ASSETS', opening_date: '2020-01-01' },
    { code: '10500', name: 'FX Receivable', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_CURR_ASSETS', opening_date: '2020-01-01', is_revaluation_enabled: true },
    { code: '10600', name: 'Receivable from Clients', gl_type: 'ASSET' as const, cat: 'ASSET', hier: 'BS_CURR_ASSETS', opening_date: '2020-01-01' },
    { code: '20100', name: 'Trust Fund Liabilities — PHP', gl_type: 'LIABILITY' as const, cat: 'LIABILITY', hier: 'BS_CURR_LIAB', opening_date: '2020-01-01' },
    { code: '20200', name: 'Accrued Fees Payable', gl_type: 'LIABILITY' as const, cat: 'LIABILITY', hier: 'BS_CURR_LIAB', opening_date: '2020-01-01' },
    { code: '20300', name: 'Withholding Tax Payable', gl_type: 'LIABILITY' as const, cat: 'LIABILITY', hier: 'BS_CURR_LIAB', opening_date: '2020-01-01' },
    { code: '20400', name: 'VAT Payable', gl_type: 'LIABILITY' as const, cat: 'LIABILITY', hier: 'BS_CURR_LIAB', opening_date: '2020-01-01' },
    { code: '30100', name: 'Retained Earnings', gl_type: 'EQUITY' as const, cat: 'EQUITY', hier: 'BS_EQUITY', opening_date: '2020-01-01', is_nominal: false },
    { code: '40100', name: 'Trust Fee Income', gl_type: 'INCOME' as const, cat: 'INCOME', hier: 'IS_REVENUE', opening_date: '2020-01-01', is_nominal: true },
    { code: '40200', name: 'Interest Income', gl_type: 'INCOME' as const, cat: 'INCOME', hier: 'IS_REVENUE', opening_date: '2020-01-01', is_nominal: true },
    { code: '40300', name: 'Dividend Income', gl_type: 'INCOME' as const, cat: 'INCOME', hier: 'IS_REVENUE', opening_date: '2020-01-01', is_nominal: true },
    { code: '40400', name: 'FX Gain', gl_type: 'INCOME' as const, cat: 'INCOME', hier: 'IS_REVENUE', opening_date: '2020-01-01', is_nominal: true },
    { code: '50100', name: 'Operating Expenses', gl_type: 'EXPENDITURE' as const, cat: 'EXPENDITURE', hier: 'IS_EXPENSE', opening_date: '2020-01-01', is_nominal: true },
    { code: '50200', name: 'FX Loss', gl_type: 'EXPENDITURE' as const, cat: 'EXPENDITURE', hier: 'IS_EXPENSE', opening_date: '2020-01-01', is_nominal: true },
    { code: '50300', name: 'Withholding Tax Expense', gl_type: 'EXPENDITURE' as const, cat: 'EXPENDITURE', hier: 'IS_EXPENSE', opening_date: '2020-01-01', is_nominal: true },
    { code: '50400', name: 'Accrued Interest Expense', gl_type: 'EXPENDITURE' as const, cat: 'EXPENDITURE', hier: 'IS_EXPENSE', opening_date: '2020-01-01', is_nominal: true },
  ];
  const headIds: Record<string, number> = {};
  let headSeeded = 0;
  for (const h of headData) {
    const [ex] = await db.select().from(schema.glHeads).where(eq(schema.glHeads.code, h.code)).limit(1);
    if (ex) { headIds[h.code] = ex.id; }
    else {
      const [ins] = await db.insert(schema.glHeads).values({
        code: h.code, name: h.name, gl_type: h.gl_type,
        category_id: catIds[h.cat], hierarchy_id: hierIds[h.hier],
        opening_date: h.opening_date, account_status: 'OPEN',
        is_manual_posting_allowed: true,
        is_revaluation_enabled: h.is_revaluation_enabled ?? false,
        is_customer_account_enabled: false,
        is_nominal: h.is_nominal ?? false,
        is_interunit: false,
        nav_inclusion: true,
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      headIds[h.code] = ins.id; headSeeded++;
    }
  }

  // Accounting Unit
  const [legalEntity] = await db.select().from(schema.legalEntities).limit(1);
  const [branch] = await db.select().from(schema.branches).limit(1);
  let auId: number | undefined;
  const [existingAu] = await db.select().from(schema.accountingUnits).where(eq(schema.accountingUnits.code, 'MNL-HQ')).limit(1);
  if (existingAu) {
    auId = existingAu.id;
  } else {
    const [ins] = await db.insert(schema.accountingUnits).values({
      code: 'MNL-HQ', name: 'Manila Head Quarter — Trust', base_currency: 'PHP', is_active: true,
      branch_id: branch?.id, legal_entity_id: legalEntity?.id,
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    auId = ins.id;
  }

  // GL Access Codes
  const accessCodes = [
    { code: 'PHP-CASH-001', name: 'PHP Cash Account', head: '10100' },
    { code: 'PHP-TFA-001', name: 'Trust Fund Assets PHP', head: '10200' },
    { code: 'PHP-INV-001', name: 'Investment Securities', head: '10300' },
    { code: 'PHP-AIR-001', name: 'Accrued Interest Receivable', head: '10400' },
    { code: 'PHP-TFL-001', name: 'Trust Fund Liabilities PHP', head: '20100' },
    { code: 'PHP-FEE-001', name: 'Accrued Fees Payable', head: '20200' },
    { code: 'PHP-WHT-001', name: 'WHT Payable', head: '20300' },
    { code: 'PHP-FEE-INC', name: 'Trust Fee Income', head: '40100' },
    { code: 'PHP-INT-INC', name: 'Interest Income', head: '40200' },
    { code: 'PHP-DIV-INC', name: 'Dividend Income', head: '40300' },
    { code: 'PHP-FXG-001', name: 'FX Gain', head: '40400' },
    { code: 'PHP-OPEX-001', name: 'Operating Expenses', head: '50100' },
    { code: 'PHP-FXL-001', name: 'FX Loss', head: '50200' },
  ];
  let acSeeded = 0;
  for (const a of accessCodes) {
    const [ex] = await db.select().from(schema.glAccessCodes).where(eq(schema.glAccessCodes.code, a.code)).limit(1);
    if (!ex) {
      await db.insert(schema.glAccessCodes).values({
        code: a.code, name: a.name, gl_head_id: headIds[a.head],
        accounting_unit_id: auId, is_active: true,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      acSeeded++;
    }
  }

  console.log(`  → ${catSeeded} categories, ${headSeeded} heads, ${acSeeded} access codes seeded. accounting_unit: ${auId}`);
  return { headIds, auId };
}

// ── 7. fund_master → gl_portfolio_master → gl_counterparty_master ─────────────

async function seedFundMaster(userId: number, auId: number | undefined) {
  console.log('[7] Seeding fund_master, gl_portfolio_master, gl_counterparty_master...');

  // Funds
  const funds = [
    { fund_code: 'TBPF-001', fund_name: 'TrustBank PHP Fixed Income Fund', fund_structure: 'open-ended', fund_type: 'UITF', fund_currency: 'PHP', nav_frequency: 'DAILY', first_nav_date: '2020-01-02' },
    { fund_code: 'TBEF-001', fund_name: 'TrustBank Equity Growth Fund', fund_structure: 'open-ended', fund_type: 'UITF', fund_currency: 'PHP', nav_frequency: 'DAILY', first_nav_date: '2020-01-02' },
    { fund_code: 'TBBF-001', fund_name: 'TrustBank Balanced Fund', fund_structure: 'open-ended', fund_type: 'UITF', fund_currency: 'PHP', nav_frequency: 'DAILY', first_nav_date: '2021-01-04' },
    { fund_code: 'TBMF-001', fund_name: 'TrustBank Money Market Fund', fund_structure: 'open-ended', fund_type: 'UITF', fund_currency: 'PHP', nav_frequency: 'DAILY', first_nav_date: '2020-01-02' },
  ];
  const fundIds: Record<string, number> = {};
  let fundsSeeded = 0;
  for (const f of funds) {
    const [ex] = await db.select().from(schema.fundMaster).where(eq(schema.fundMaster.fund_code, f.fund_code)).limit(1);
    if (ex) { fundIds[f.fund_code] = ex.id; }
    else {
      const [ins] = await db.insert(schema.fundMaster).values({
        ...f, unit_precision: 4, nav_decimals: 4, nav_rounding_method: 'ROUND_OFF',
        tax_on_interest: false, is_active: true,
        accounting_unit_id: auId,
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      fundIds[f.fund_code] = ins.id; fundsSeeded++;
    }
  }

  // GL Portfolio Master — link to existing portfolios
  const portfolios = await db.select().from(schema.portfolios).limit(11);
  let pmSeeded = 0;
  for (const p of portfolios) {
    const [ex] = await db.select().from(schema.glPortfolioMaster).where(eq(schema.glPortfolioMaster.portfolio_id, p.portfolio_id)).limit(1);
    if (!ex) {
      const fund = Object.values(fundIds)[pmSeeded % Object.values(fundIds).length];
      await db.insert(schema.glPortfolioMaster).values({
        portfolio_code: `GL-${p.portfolio_id}`,
        portfolio_name: `GL View — ${p.portfolio_id}`,
        fund_id: fund,
        portfolio_id: p.portfolio_id,
        accounting_unit_id: auId,
        product_class: 'IMA',
        discretionary_flag: true,
        tax_exempt: false,
        is_government_entity: false,
        is_specialized_institutional: false,
        base_currency: 'PHP',
        is_active: true,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      pmSeeded++;
    }
  }

  // GL Counterparty Master
  const counterparties = await db.select().from(schema.counterparties).limit(5);
  let cpSeeded = 0;
  for (const cp of counterparties) {
    const [ex] = await db.select().from(schema.glCounterpartyMaster).where(eq(schema.glCounterpartyMaster.counterparty_id, cp.id)).limit(1);
    if (!ex) {
      await db.insert(schema.glCounterpartyMaster).values({
        counterparty_code: `GCP-${cp.id.toString().padStart(3, '0')}`,
        counterparty_name: cp.name,
        counterparty_id: cp.id,
        frpti_sector: 'FINANCIAL_INSTITUTION',
        frpti_sub_sector: 'COMMERCIAL_BANK',
        resident_status: 'RESIDENT',
        is_government: false,
        country_code: 'PH',
        is_active: true,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      cpSeeded++;
    }
  }

  console.log(`  → ${fundsSeeded} funds, ${pmSeeded} GL portfolios, ${cpSeeded} counterparties seeded`);
  return fundIds;
}

// ── 8. frpti_mappings, fs_mapping, reval_parameters ──────────────────────────

async function seedGlMappings(userId: number, headIds: Record<string, number>) {
  console.log('[8] Seeding frpti_mappings, fs_mapping, reval_parameters...');

  // FRPTI Mappings
  const frptiData = [
    { head: '10200', report_line: 'TRUST_ASSETS_PHP', schedule: 'SCHEDULE_A' },
    { head: '10300', report_line: 'INVESTMENT_SECURITIES', schedule: 'SCHEDULE_B' },
    { head: '40100', report_line: 'TRUST_FEE_INCOME', schedule: 'SCHEDULE_C' },
    { head: '40200', report_line: 'INTEREST_INCOME', schedule: 'SCHEDULE_C' },
  ];
  let frptiSeeded = 0;
  for (const f of frptiData) {
    if (headIds[f.head]) {
      await db.insert(schema.frptiMappings).values({
        gl_head_id: headIds[f.head],
        frpti_report_line: f.report_line,
        frpti_schedule: f.schedule,
        frpti_book: 'RBU',
        effective_from: '2020-01-01',
        mapping_version: 1,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      frptiSeeded++;
    }
  }

  // FS Mapping
  const fsData = [
    { head: '10100', report_type: 'BALANCE_SHEET', section: 'CURRENT_ASSETS', line: 'Cash on Hand' },
    { head: '10200', report_type: 'BALANCE_SHEET', section: 'CURRENT_ASSETS', line: 'Trust Fund Assets' },
    { head: '10300', report_type: 'BALANCE_SHEET', section: 'NON_CURRENT_ASSETS', line: 'Investment Securities' },
    { head: '20100', report_type: 'BALANCE_SHEET', section: 'CURRENT_LIABILITIES', line: 'Trust Fund Liabilities' },
    { head: '30100', report_type: 'BALANCE_SHEET', section: 'EQUITY', line: 'Retained Earnings' },
    { head: '40100', report_type: 'INCOME_STATEMENT', section: 'REVENUE', line: 'Trust Fee Income' },
    { head: '40200', report_type: 'INCOME_STATEMENT', section: 'REVENUE', line: 'Interest Income' },
    { head: '50100', report_type: 'INCOME_STATEMENT', section: 'EXPENSES', line: 'Operating Expenses' },
  ];
  let fsSeeded = 0;
  for (const f of fsData) {
    if (headIds[f.head]) {
      await db.insert(schema.fsMapping).values({
        gl_head_id: headIds[f.head],
        report_type: f.report_type,
        report_section: f.section,
        report_line: f.line,
        sort_order: fsSeeded + 1,
        effective_from: '2020-01-01',
        mapping_version: 1,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      fsSeeded++;
    }
  }

  // Reval Parameters
  let revalSeeded = 0;
  if (headIds['10500'] && headIds['40400'] && headIds['50200']) {
    await db.insert(schema.revalParameters).values({
      gl_head_id: headIds['10500'],
      gain_gl_id: headIds['40400'],
      loss_gl_id: headIds['50200'],
      effective_from: '2020-01-01',
      revaluation_frequency: 'DAILY',
      is_active: true,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    revalSeeded++;
  }

  console.log(`  → ${frptiSeeded} frpti, ${fsSeeded} fs mappings, ${revalSeeded} reval params seeded`);
}

// ── 9. GL Event Definitions → Criteria → Conditions → Rule Sets → Entry Defs ─

async function seedGlRuleEngine(userId: number, headIds: Record<string, number>) {
  console.log('[9] Seeding GL event definitions, criteria, rule sets, entry definitions...');

  // Event Definitions
  const events = [
    { product: 'TRUST', event_code: 'TRUST_FEE_ACCRUAL', event_name: 'Trust Fee Accrual', posting_mode: 'BATCH' as const },
    { product: 'TRUST', event_code: 'TRUST_FEE_COLLECTION', event_name: 'Trust Fee Collection', posting_mode: 'BATCH' as const },
    { product: 'TRUST', event_code: 'INVESTMENT_PURCHASE', event_name: 'Investment Purchase', posting_mode: 'ONLINE' as const },
    { product: 'TRUST', event_code: 'INVESTMENT_SALE', event_name: 'Investment Sale', posting_mode: 'ONLINE' as const },
    { product: 'TRUST', event_code: 'INTEREST_RECEIPT', event_name: 'Interest Receipt', posting_mode: 'EOD' as const },
    { product: 'TRUST', event_code: 'DIVIDEND_RECEIPT', event_name: 'Dividend Receipt', posting_mode: 'EOD' as const },
    { product: 'UITF', event_code: 'UITF_SUBSCRIPTION', event_name: 'UITF Subscription', posting_mode: 'ONLINE' as const },
    { product: 'UITF', event_code: 'UITF_REDEMPTION', event_name: 'UITF Redemption', posting_mode: 'ONLINE' as const },
    { product: 'FX', event_code: 'FX_REVALUATION', event_name: 'FX Revaluation', posting_mode: 'EOD' as const },
  ];
  const eventIds: Record<string, number> = {};
  let evSeeded = 0;
  for (const e of events) {
    const [ex] = await db.select().from(schema.glEventDefinitions).where(eq(schema.glEventDefinitions.event_code, e.event_code)).limit(1);
    if (ex) { eventIds[e.event_code] = ex.id; }
    else {
      const [ins] = await db.insert(schema.glEventDefinitions).values({
        ...e, is_active: true,
        authorization_policy: ['ONLINE', 'MANUAL'].includes(e.posting_mode) ? 'MAKER_CHECKER' : 'AUTO',
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      eventIds[e.event_code] = ins.id; evSeeded++;
    }
  }

  // Criteria definitions (one default per event)
  const criteriaIds: Record<string, number> = {};
  let criSeeded = 0;
  for (const [code, eventId] of Object.entries(eventIds)) {
    const [ins] = await db.insert(schema.glCriteriaDefinitions).values({
      event_id: eventId,
      criteria_name: `Default — ${code}`,
      priority: 100,
      effective_from: '2020-01-01',
      is_default: true,
      is_active: true,
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    criteriaIds[code] = ins.id; criSeeded++;

    // Criteria condition
    await db.insert(schema.glCriteriaConditions).values({
      criteria_id: ins.id,
      field_name: 'currency',
      relation: '=',
      field_value: 'PHP',
      created_by_user_id: userId, updated_by_user_id: userId,
    });
  }

  // Rule sets + entry definitions for key events
  const ruleEntries = [
    {
      code: 'TRUST_FEE_ACCRUAL', ruleCode: 'TFA-PHP-001',
      dr: headIds['50100'], cr: headIds['20200'],
      drName: 'DR Operating Expense (Fee Accrual)', crName: 'CR Accrued Fees Payable',
    },
    {
      code: 'INTEREST_RECEIPT', ruleCode: 'INT-PHP-001',
      dr: headIds['10100'], cr: headIds['40200'],
      drName: 'DR Cash', crName: 'CR Interest Income',
    },
    {
      code: 'DIVIDEND_RECEIPT', ruleCode: 'DIV-PHP-001',
      dr: headIds['10100'], cr: headIds['40300'],
      drName: 'DR Cash', crName: 'CR Dividend Income',
    },
  ];
  let rsSeeded = 0;
  for (const r of ruleEntries) {
    if (!criteriaIds[r.code] || !r.dr || !r.cr) continue;
    const [rs] = await db.insert(schema.glAccountingRuleSets).values({
      criteria_id: criteriaIds[r.code],
      rule_code: r.ruleCode,
      rule_name: r.ruleCode,
      rule_version: 1,
      rule_status: 'ACTIVE',
      effective_from: '2020-01-01',
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    // DR line
    await db.insert(schema.glAccountingEntryDefinitions).values({
      rule_set_id: rs.id, line_order: 1, dr_cr: 'DR',
      gl_selector: r.dr.toString(), gl_selector_type: 'STATIC',
      amount_type: 'FIELD', amount_field: 'amount',
      narration_template: r.drName,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    // CR line
    await db.insert(schema.glAccountingEntryDefinitions).values({
      rule_set_id: rs.id, line_order: 2, dr_cr: 'CR',
      gl_selector: r.cr.toString(), gl_selector_type: 'STATIC',
      amount_type: 'FIELD', amount_field: 'amount',
      narration_template: r.crName,
      created_by_user_id: userId, updated_by_user_id: userId,
    });

    // Test case
    await db.insert(schema.glRuleTestCases).values({
      rule_set_id: rs.id,
      test_name: `Happy path — ${r.ruleCode}`,
      sample_event_payload: { currency: 'PHP', amount: 10000 },
      expected_journal_lines: [
        { dr_cr: 'DR', gl_selector: r.dr.toString(), amount: 10000 },
        { dr_cr: 'CR', gl_selector: r.cr.toString(), amount: 10000 },
      ],
      is_rejection_case: false,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    rsSeeded++;
  }

  console.log(`  → ${evSeeded} events, ${criSeeded} criteria, ${rsSeeded} rule sets seeded`);
}

// ── 10. GL Authorization Matrix ───────────────────────────────────────────────

async function seedGlAuthMatrix(userId: number) {
  console.log('[10] Seeding gl_authorization_matrix...');
  const matrix = [
    { entity_type: 'JOURNAL_BATCH', action: 'CREATE', amount_from: '0', amount_to: '1000000', required_approvers: 1, approval_level: 'STANDARD', role_required: 'bo_checker' },
    { entity_type: 'JOURNAL_BATCH', action: 'CREATE', amount_from: '1000000', amount_to: null, required_approvers: 2, approval_level: 'SENIOR', role_required: 'bo_head' },
    { entity_type: 'JOURNAL_BATCH', action: 'CANCEL', amount_from: '0', amount_to: null, required_approvers: 1, approval_level: 'STANDARD', role_required: 'bo_checker' },
    { entity_type: 'REVERSAL', action: 'REVERSE', amount_from: '0', amount_to: '500000', required_approvers: 1, approval_level: 'STANDARD', role_required: 'bo_checker' },
    { entity_type: 'REVERSAL', action: 'REVERSE', amount_from: '500000', amount_to: null, required_approvers: 2, approval_level: 'SENIOR', role_required: 'bo_head' },
    { entity_type: 'GL_HEAD', action: 'CREATE', amount_from: '0', amount_to: null, required_approvers: 1, approval_level: 'EXECUTIVE', role_required: 'bo_admin' },
    { entity_type: 'RULE_SET', action: 'CREATE', amount_from: '0', amount_to: null, required_approvers: 1, approval_level: 'SENIOR', role_required: 'bo_head' },
    { entity_type: 'YEAR_END', action: 'CLOSE', amount_from: '0', amount_to: null, required_approvers: 2, approval_level: 'EXECUTIVE', role_required: 'bo_admin' },
  ];
  let seeded = 0;
  for (const m of matrix) {
    await db.insert(schema.glAuthorizationMatrix).values({ ...m, is_active: true, created_by_user_id: userId, updated_by_user_id: userId });
    seeded++;
  }
  console.log(`  → ${seeded} auth matrix rules seeded`);
}

// ── 11. GL Financial Years + Periods ─────────────────────────────────────────

async function seedGlFinancialCalendar(userId: number) {
  console.log('[11] Seeding gl_financial_years, gl_financial_periods...');
  const years = [
    { year_code: 'FY2024', start_date: '2024-01-01', end_date: '2024-12-31' },
    { year_code: 'FY2025', start_date: '2025-01-01', end_date: '2025-12-31' },
    { year_code: 'FY2026', start_date: '2026-01-01', end_date: '2026-12-31' },
  ];
  const yearIds: Record<string, number> = {};
  let ySeeded = 0;
  for (const y of years) {
    const [ex] = await db.select().from(schema.glFinancialYears).where(eq(schema.glFinancialYears.year_code, y.year_code)).limit(1);
    if (ex) { yearIds[y.year_code] = ex.id; }
    else {
      const [ins] = await db.insert(schema.glFinancialYears).values({
        ...y, is_closed: y.year_code === 'FY2024',
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      yearIds[y.year_code] = ins.id; ySeeded++;
    }
  }

  let pSeeded = 0;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const endDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (const [yk, yId] of Object.entries(yearIds)) {
    const year = parseInt(yk.replace('FY', ''));
    // Monthly periods
    for (let m = 0; m < 12; m++) {
      const code = `${year}-${String(m + 1).padStart(2, '0')}`;
      const start = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const isLeap = year % 4 === 0;
      const days = m === 1 && isLeap ? 29 : endDays[m];
      const end = `${year}-${String(m + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
      const isClosed = year < 2026 || (year === 2026 && m < 3);
      const [ex] = await db.select().from(schema.glFinancialPeriods).where(eq(schema.glFinancialPeriods.period_code, code)).limit(1);
      if (!ex) {
        await db.insert(schema.glFinancialPeriods).values({
          year_id: yId, period_code: code, period_type: 'MONTHLY',
          start_date: start, end_date: end,
          is_closed: isClosed,
          created_by_user_id: userId, updated_by_user_id: userId,
        });
        pSeeded++;
      }
    }
    // Quarterly periods
    const quarters = [
      { code: `${year}-Q1`, start: `${year}-01-01`, end: `${year}-03-31` },
      { code: `${year}-Q2`, start: `${year}-04-01`, end: `${year}-06-30` },
      { code: `${year}-Q3`, start: `${year}-07-01`, end: `${year}-09-30` },
      { code: `${year}-Q4`, start: `${year}-10-01`, end: `${year}-12-31` },
    ];
    for (const q of quarters) {
      const [ex] = await db.select().from(schema.glFinancialPeriods).where(eq(schema.glFinancialPeriods.period_code, q.code)).limit(1);
      if (!ex) {
        await db.insert(schema.glFinancialPeriods).values({
          year_id: yId, period_code: q.code, period_type: 'QUARTERLY',
          start_date: q.start, end_date: q.end,
          is_closed: year < 2026,
          created_by_user_id: userId, updated_by_user_id: userId,
        });
        pSeeded++;
      }
    }
  }
  console.log(`  → ${ySeeded} years, ${pSeeded} periods seeded`);
}

// ── 12. GL Report Definitions + Report Pack Templates ─────────────────────────

async function seedGlReports(userId: number) {
  console.log('[12] Seeding gl_report_definitions, report_pack_templates...');
  const reports = [
    { name: 'Trial Balance', columns: [{ field: 'gl_head_code', header: 'GL Code' }, { field: 'name', header: 'Name' }, { field: 'debit', header: 'Debit' }, { field: 'credit', header: 'Credit' }], filters: [{ field: 'balance_date', operator: '=', value: 'TODAY' }] },
    { name: 'GL Ledger Detail', columns: [{ field: 'batch_ref', header: 'Ref' }, { field: 'transaction_date', header: 'Date' }, { field: 'narration', header: 'Narration' }, { field: 'debit', header: 'Dr' }, { field: 'credit', header: 'Cr' }] },
    { name: 'FRPTI Schedule A', columns: [{ field: 'report_line', header: 'Line' }, { field: 'amount', header: 'Amount' }], filters: [{ field: 'frpti_schedule', operator: '=', value: 'SCHEDULE_A' }] },
    { name: 'Income Statement', columns: [{ field: 'category', header: 'Category' }, { field: 'name', header: 'Account' }, { field: 'amount', header: 'Amount' }], filters: [{ field: 'gl_type', operator: 'in', value: ['INCOME', 'EXPENDITURE'] }] },
    { name: 'Balance Sheet', columns: [{ field: 'category', header: 'Category' }, { field: 'name', header: 'Account' }, { field: 'balance', header: 'Balance' }] },
  ];
  let rSeeded = 0;
  const reportIds: number[] = [];
  for (const r of reports) {
    const [ins] = await db.insert(schema.glReportDefinitions).values({
      name: r.name, columns: r.columns, filters: r.filters ?? null,
      owner_user_id: userId,
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    reportIds.push(ins.id);
    await db.insert(schema.glReportSchedules).values({
      report_definition_id: ins.id,
      schedule_name: `Daily — ${r.name}`,
      frequency: 'DAILY',
      next_run_date: d(1),
      output_format: 'PDF',
      recipients: [{ email: 'reports@trustbank.ph', name: 'Reports Distribution' }],
      is_active: true,
      owner_user_id: userId,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    rSeeded++;
  }

  // Report Pack Templates
  const packs = [
    { pack_name: 'Monthly Management Pack', report_types: ['Trial Balance', 'Income Statement', 'Balance Sheet'], schedule_cron: '0 8 1 * *' },
    { pack_name: 'Quarterly FRPTI Pack', report_types: ['FRPTI Schedule A', 'Trial Balance'], schedule_cron: '0 8 1 1,4,7,10 *' },
  ];
  let pkSeeded = 0;
  for (const p of packs) {
    await db.insert(schema.reportPackTemplates).values({
      ...p, is_active: true,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    pkSeeded++;
  }
  console.log(`  → ${rSeeded} report definitions, ${pkSeeded} report packs seeded`);
}

// ── 13. FX Rates ──────────────────────────────────────────────────────────────

async function seedFxRates(userId: number) {
  console.log('[13] Seeding fx_rates...');
  const pairs = [
    { from: 'USD', to: 'PHP', purchase: '55.80', selling: '56.20', mid: '56.00' },
    { from: 'EUR', to: 'PHP', purchase: '61.50', selling: '62.10', mid: '61.80' },
    { from: 'GBP', to: 'PHP', purchase: '70.20', selling: '71.00', mid: '70.60' },
    { from: 'JPY', to: 'PHP', purchase: '0.370', selling: '0.380', mid: '0.375' },
    { from: 'SGD', to: 'PHP', purchase: '41.50', selling: '42.00', mid: '41.75' },
    { from: 'HKD', to: 'PHP', purchase: '7.10', selling: '7.20', mid: '7.15' },
    { from: 'PHP', to: 'USD', purchase: '0.0177', selling: '0.0179', mid: '0.0178' },
  ];
  const dates = [d(-7), d(-6), d(-5), d(-4), d(-3), d(-2), d(-1), d(0)];
  let seeded = 0;
  for (const dt of dates) {
    for (const p of pairs) {
      const [ex] = await db.select().from(schema.fxRates)
        .where(sql`currency_from = ${p.from} AND currency_to = ${p.to} AND business_date = ${dt} AND rate_type_code = 'BSP'`)
        .limit(1);
      if (!ex) {
        await db.insert(schema.fxRates).values({
          rate_type_code: 'BSP', rate_type: 'ACTUAL', rate_flag: 'DAILY',
          currency_from: p.from, currency_to: p.to, business_date: dt, date_serial: 1,
          purchase_rate: p.purchase, selling_rate: p.selling, mid_rate: p.mid,
          source: 'MANUAL',
          created_by_user_id: userId, updated_by_user_id: userId,
        });
        seeded++;
      }
    }
  }
  console.log(`  → ${seeded} FX rates seeded`);
}

// ── 14. compliance_limits ─────────────────────────────────────────────────────

async function seedComplianceLimits(userId: number) {
  console.log('[14] Seeding compliance_limits...');
  const limits = [
    { limit_type: 'issuer', dimension: 'SINGLE_ISSUER_MAX_PCT', dimension_id: 'DEFAULT', limit_amount: '10000000', warning_threshold_pct: 80 },
    { limit_type: 'sector', dimension: 'SECTOR_MAX_PCT', dimension_id: 'GOVERNMENT', limit_amount: '50000000', warning_threshold_pct: 75 },
    { limit_type: 'broker', dimension: 'BROKER_CREDIT_LIMIT', dimension_id: 'DEFAULT', limit_amount: '5000000', warning_threshold_pct: 80 },
    { limit_type: 'counterparty', dimension: 'CP_CREDIT_LIMIT', dimension_id: 'DEFAULT', limit_amount: '20000000', warning_threshold_pct: 80 },
    { limit_type: 'trader', dimension: 'DAILY_TRADE_LIMIT', dimension_id: 'DEFAULT', limit_amount: '100000000', warning_threshold_pct: 90 },
    { limit_type: 'outlet', dimension: 'OUTLET_MAX_EXPOSURE', dimension_id: 'MNL', limit_amount: '500000000', warning_threshold_pct: 85 },
  ];
  let seeded = 0;
  for (const l of limits) {
    await db.insert(schema.complianceLimits).values({
      ...l, current_exposure: '0', is_active: true,
      effective_from: '2026-01-01',
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    seeded++;
  }
  console.log(`  → ${seeded} compliance limits seeded`);
}

// ── 15. dedupe_rules + negative_list ─────────────────────────────────────────

async function seedDedupeAndNegativeList(userId: number) {
  console.log('[15] Seeding dedupe_rules, negative_list...');

  const dedupeRules = [
    { entity_type: 'INDIVIDUAL' as const, person_type: 'NATURAL', field_combination: ['first_name', 'last_name', 'date_of_birth'], stop_type: 'HARD_STOP' as const, priority: 1 },
    { entity_type: 'INDIVIDUAL' as const, person_type: 'NATURAL', field_combination: ['email'], stop_type: 'SOFT_STOP' as const, priority: 2 },
    { entity_type: 'INDIVIDUAL' as const, person_type: 'NATURAL', field_combination: ['phone'], stop_type: 'SOFT_STOP' as const, priority: 3 },
    { entity_type: 'NON_INDIVIDUAL' as const, person_type: 'ENTITY', field_combination: ['entity_name', 'tin_number'], stop_type: 'HARD_STOP' as const, priority: 1 },
  ];
  let drSeeded = 0;
  for (const r of dedupeRules) {
    await db.insert(schema.dedupeRules).values({ ...r, is_active: true, created_by_user_id: userId, updated_by_user_id: userId });
    drSeeded++;
  }

  const negativeList = [
    { list_type: 'SANCTIONS' as const, first_name: 'JUAN', last_name: 'DELA CRUZ', nationality: 'PH', reason: 'OFAC Sanction', source: 'OFAC_SDN', effective_date: '2024-01-01' },
    { list_type: 'PEP' as const, first_name: 'MARIA', last_name: 'SANTOS', nationality: 'PH', reason: 'PEP — National Politician', source: 'MANUAL', effective_date: '2024-06-01' },
    { list_type: 'BLACKLIST' as const, entity_name: 'BLACKLISTED CORP INC', reason: 'Court order — financial fraud', source: 'AMLC', effective_date: '2025-01-15' },
    { list_type: 'NEGATIVE' as const, first_name: 'PEDRO', last_name: 'REYES', reason: 'Previous account closure — fraud', source: 'INTERNAL', effective_date: '2025-03-01' },
  ];
  let nlSeeded = 0;
  for (const n of negativeList) {
    await db.insert(schema.negativeList).values({ ...n, is_active: true, created_by_user_id: userId, updated_by_user_id: userId });
    nlSeeded++;
  }
  console.log(`  → ${drSeeded} dedupe rules, ${nlSeeded} negative list entries seeded`);
}

// ── 16. content_packs ─────────────────────────────────────────────────────────

async function seedContentPacks(userId: number) {
  console.log('[16] Seeding content_packs...');
  const [jur] = await db.select().from(schema.jurisdictions).limit(1);

  const packs = [
    {
      pack_name: 'PH DSAR Notice v1', category: 'DSAR',
      payload: { notice_text: 'Under the Data Privacy Act of 2012 (Republic Act 10173), you have the right to access, correct, and object to the processing of your personal data.', response_days: 30, data_privacy_url: 'https://trustbank.ph/privacy' },
      pack_status: 'ACTIVE' as const,
    },
    {
      pack_name: 'Investment Risk Disclosure v1', category: 'RISK_DISCLOSURE',
      payload: { disclosure_text: 'Investments involve risk. Past performance is not indicative of future results. The value of your investments may go up or down.', version: '1.0', effective_date: '2026-01-01' },
      pack_status: 'ACTIVE' as const,
    },
    {
      pack_name: 'Marketing Consent Template v1', category: 'MARKETING_CONSENT',
      payload: { consent_text: 'I agree to receive marketing communications from TrustBank Philippines regarding investment products, market updates, and exclusive offers.', channels: ['EMAIL', 'SMS', 'PUSH_NOTIFICATION'], opt_out_url: 'https://trustbank.ph/unsubscribe' },
      pack_status: 'ACTIVE' as const,
    },
    {
      pack_name: 'UITF Product Highlights v1', category: 'PRODUCT_INFO',
      payload: { products: ['TBPF-001', 'TBEF-001', 'TBBF-001', 'TBMF-001'], version: '1.0', effective_date: '2026-01-01' },
      pack_status: 'STAGED' as const,
    },
  ];
  let seeded = 0;
  for (const p of packs) {
    await db.insert(schema.contentPacks).values({
      ...p, jurisdiction_id: jur?.id,
      signature_hash: `sha256-${Math.random().toString(36).slice(2)}`,
      activated_by: userId,
      activated_at: p.pack_status === 'ACTIVE' ? NOW : null,
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    seeded++;
  }
  console.log(`  → ${seeded} content packs seeded`);
}

// ── 17. regulatory_calendar ───────────────────────────────────────────────────

async function seedRegulatoryCalendar(userId: number) {
  console.log('[17] Seeding regulatory_calendar...');
  const [jur] = await db.select().from(schema.jurisdictions).limit(1);

  const events = [
    { title: 'BSP Circular 1111 Implementation', regulatory_body: 'BSP', effective_date: d(30), category: 'COMPLIANCE', cal_status: 'UPCOMING' },
    { title: 'AMLC Covered Transaction Reporting — Q1 2026', regulatory_body: 'AMLC', effective_date: '2026-04-15', category: 'AML', cal_status: 'UPCOMING' },
    { title: 'BIR Form 1601-FQ Filing Deadline Q1 2026', regulatory_body: 'BIR', effective_date: '2026-04-30', category: 'TAX', cal_status: 'UPCOMING' },
    { title: 'FRPTI Quarterly Report Submission — Q1 2026', regulatory_body: 'BSP', effective_date: '2026-05-15', category: 'REPORTING', cal_status: 'UPCOMING' },
    { title: 'SEC Annual Financial Report Filing', regulatory_body: 'SEC', effective_date: '2026-06-30', category: 'REPORTING', cal_status: 'UPCOMING' },
    { title: 'PDIC Annual Assessment Certification', regulatory_body: 'PDIC', effective_date: '2026-07-31', category: 'COMPLIANCE', cal_status: 'UPCOMING' },
    { title: 'BSP Trust Examination — Annual', regulatory_body: 'BSP', effective_date: d(90), category: 'EXAMINATION', cal_status: 'UPCOMING' },
    { title: 'AMLC Training Requirements Update', regulatory_body: 'AMLC', effective_date: d(15), category: 'TRAINING', cal_status: 'UPCOMING' },
  ];
  let seeded = 0;
  for (const e of events) {
    await db.insert(schema.regulatoryCalendar).values({
      ...e, jurisdiction_id: jur?.id,
      impact: { departments: ['Compliance', 'Operations', 'Finance'], priority: 'HIGH' },
      created_by_user_id: userId, updated_by_user_id: userId,
    });
    seeded++;
  }
  console.log(`  → ${seeded} regulatory calendar events seeded`);
}

// ── 18. scrutiny_templates ────────────────────────────────────────────────────

async function seedScrutinyTemplates(userId: number) {
  console.log('[18] Seeding scrutiny_templates...');
  const templates = [
    { label: 'KYC Verification Complete', description: 'Verify that KYC documents are complete and valid', category: 'KYC', sort_order: 1, is_mandatory: true, applies_to: 'both' as const },
    { label: 'No Pending Sanctions Alert', description: 'Confirm no open sanctions screening alerts', category: 'COMPLIANCE', sort_order: 2, is_mandatory: true, applies_to: 'both' as const },
    { label: 'No Open Complaints', description: 'Confirm client has no unresolved complaints', category: 'COMPLIANCE', sort_order: 3, is_mandatory: true, applies_to: 'handover_only' as const },
    { label: 'No Pending Trades', description: 'Confirm no unsettled trades before handover date', category: 'TRADING', sort_order: 4, is_mandatory: true, applies_to: 'handover_only' as const },
    { label: 'Outstanding Documents Cleared', description: 'All document deficiencies resolved', category: 'DOCUMENTATION', sort_order: 5, is_mandatory: false, applies_to: 'handover_only' as const },
    { label: 'Client Notified', description: 'Client has been informed of RM change', category: 'CLIENT_COMM', sort_order: 6, is_mandatory: false, applies_to: 'handover_only' as const },
    { label: 'Risk Profile Reviewed', description: 'Risk profile reviewed and current', category: 'RISK', sort_order: 7, is_mandatory: false, applies_to: 'both' as const },
    { label: 'Delegate Briefed', description: 'Delegate RM has been briefed on client portfolio', category: 'BRIEFING', sort_order: 1, is_mandatory: true, applies_to: 'delegation_only' as const },
    { label: 'Delegation Period Confirmed', description: 'Start and end dates confirmed with delegate', category: 'ADMIN', sort_order: 2, is_mandatory: true, applies_to: 'delegation_only' as const },
  ];
  let seeded = 0;
  for (const t of templates) {
    const [ex] = await db.select().from(schema.scrutinyTemplates).where(eq(schema.scrutinyTemplates.label, t.label)).limit(1);
    if (!ex) {
      await db.insert(schema.scrutinyTemplates).values({ ...t, is_active: true, created_by_user_id: userId, updated_by_user_id: userId });
      seeded++;
    }
  }
  console.log(`  → ${seeded} scrutiny templates seeded`);
}

// ── 19. questionnaires → questions → answer_options → score_normalization ─────

async function seedRiskProfilingReference(userId: number) {
  console.log('[19] Seeding questionnaires, questions, answer_options, score_normalization_ranges...');

  // Questionnaire
  const [exQ] = await db.select().from(schema.questionnaires).where(eq(schema.questionnaires.questionnaire_name, 'Risk Profiling Questionnaire — Standard v1')).limit(1);
  let qId: number;
  if (exQ) {
    qId = exQ.id;
  } else {
    const [ins] = await db.insert(schema.questionnaires).values({
      questionnaire_name: 'Risk Profiling Questionnaire — Standard v1',
      customer_category: 'INDIVIDUAL',
      questionnaire_type: 'FINANCIAL_PROFILING',
      effective_start_date: '2024-01-01',
      effective_end_date: '2027-12-31',
      valid_period_years: 2,
      is_score: true,
      warning_text: 'Your answers will determine your risk category. Please answer honestly.',
      acknowledgement_text: 'I acknowledge that the above information is accurate and complete.',
      disclaimer_text: 'This questionnaire is for information purposes only and does not constitute financial advice.',
      authorization_status: 'AUTHORIZED',
      maker_id: userId,
      checker_id: userId,
      authorized_at: new Date('2024-01-01'),
      entity_id: 'default',
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    qId = ins.id;
  }

  // Questions and Answer Options
  const questionsData = [
    {
      q_no: 1, desc: 'What is your primary investment objective?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Capital Preservation — protect my principal at all costs', weightage: '10' },
        { no: 2, desc: 'Income — regular income with minimal risk', weightage: '25' },
        { no: 3, desc: 'Balanced — mix of income and growth', weightage: '50' },
        { no: 4, desc: 'Growth — long-term capital appreciation', weightage: '75' },
        { no: 5, desc: 'Aggressive Growth — maximize returns', weightage: '100' },
      ],
    },
    {
      q_no: 2, desc: 'What is your investment time horizon?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Less than 1 year', weightage: '10' },
        { no: 2, desc: '1–3 years', weightage: '30' },
        { no: 3, desc: '3–5 years', weightage: '55' },
        { no: 4, desc: '5–10 years', weightage: '80' },
        { no: 5, desc: 'More than 10 years', weightage: '100' },
      ],
    },
    {
      q_no: 3, desc: 'If your investment dropped 20% in value, you would:', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Sell all investments immediately', weightage: '10' },
        { no: 2, desc: 'Sell some investments to reduce losses', weightage: '30' },
        { no: 3, desc: 'Do nothing — wait for recovery', weightage: '60' },
        { no: 4, desc: 'Buy more to average down', weightage: '90' },
      ],
    },
    {
      q_no: 4, desc: 'What percentage of your monthly income do you save/invest?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Less than 10%', weightage: '15' },
        { no: 2, desc: '10–20%', weightage: '35' },
        { no: 3, desc: '20–30%', weightage: '60' },
        { no: 4, desc: 'More than 30%', weightage: '90' },
      ],
    },
    {
      q_no: 5, desc: 'What is your investment experience?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'No investment experience', weightage: '10' },
        { no: 2, desc: 'Basic — savings accounts and time deposits only', weightage: '25' },
        { no: 3, desc: 'Intermediate — mutual funds or UITFs', weightage: '55' },
        { no: 4, desc: 'Advanced — stocks, bonds, foreign securities', weightage: '80' },
        { no: 5, desc: 'Expert — derivatives and complex instruments', weightage: '100' },
      ],
    },
    {
      q_no: 6, desc: 'What is your annual gross income?', is_mandatory: true, is_multi_select: false, scoring_type: 'RANGE' as const, computation_type: 'SUM' as const,
      options: [
        { no: 1, desc: 'Below PHP 300,000', weightage: '10' },
        { no: 2, desc: 'PHP 300,001 – 1,000,000', weightage: '30' },
        { no: 3, desc: 'PHP 1,000,001 – 3,000,000', weightage: '60' },
        { no: 4, desc: 'Above PHP 3,000,000', weightage: '90' },
      ],
      ranges: [
        { from: '0', to: '25', normalized: '20' },
        { from: '25', to: '50', normalized: '50' },
        { from: '50', to: '75', normalized: '75' },
        { from: '75', to: '100', normalized: '100' },
      ],
    },
    {
      q_no: 7, desc: 'What is the primary source of your investable funds?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Employment / Salary', weightage: '40' },
        { no: 2, desc: 'Business income', weightage: '60' },
        { no: 3, desc: 'Inheritance / Gift', weightage: '30' },
        { no: 4, desc: 'Investment returns', weightage: '70' },
        { no: 5, desc: 'Retirement / Pension', weightage: '20' },
      ],
    },
    {
      q_no: 8, desc: 'Do you have outstanding loans or liabilities exceeding 50% of your assets?', is_mandatory: true, is_multi_select: false, scoring_type: 'NONE' as const, computation_type: 'NONE' as const,
      options: [
        { no: 1, desc: 'Yes', weightage: '10' },
        { no: 2, desc: 'No', weightage: '70' },
      ],
    },
  ];

  let qSeeded = 0;
  let aSeeded = 0;
  let nSeeded = 0;
  for (const qd of questionsData) {
    const [exQst] = await db.select().from(schema.questions)
      .where(sql`questionnaire_id = ${qId} AND question_number = ${qd.q_no}`).limit(1);
    let qstId: number;
    if (exQst) { qstId = exQst.id; }
    else {
      const [ins] = await db.insert(schema.questions).values({
        questionnaire_id: qId, question_number: qd.q_no,
        question_description: qd.desc, is_mandatory: qd.is_mandatory,
        is_multi_select: qd.is_multi_select, scoring_type: qd.scoring_type,
        computation_type: qd.computation_type,
        created_by_user_id: userId, updated_by_user_id: userId,
      }).returning();
      qstId = ins.id; qSeeded++;
    }

    for (const opt of qd.options) {
      const [exA] = await db.select().from(schema.answerOptions)
        .where(sql`question_id = ${qstId} AND option_number = ${opt.no}`).limit(1);
      if (!exA) {
        await db.insert(schema.answerOptions).values({
          question_id: qstId, option_number: opt.no,
          answer_description: opt.desc, weightage: opt.weightage,
          created_by_user_id: userId, updated_by_user_id: userId,
        });
        aSeeded++;
      }
    }

    if (qd.ranges) {
      for (const r of qd.ranges) {
        const [exN] = await db.select().from(schema.scoreNormalizationRanges)
          .where(sql`question_id = ${qstId} AND range_from = ${r.from}`).limit(1);
        if (!exN) {
          await db.insert(schema.scoreNormalizationRanges).values({
            question_id: qstId, range_from: r.from, range_to: r.to,
            normalized_score: r.normalized,
            created_by_user_id: userId, updated_by_user_id: userId,
          });
          nSeeded++;
        }
      }
    }
  }
  console.log(`  → ${qSeeded} questions, ${aSeeded} answer options, ${nSeeded} score ranges seeded. questionnaire_id=${qId}`);
  return qId;
}

// ── 20. risk_appetite_mappings → risk_appetite_bands ─────────────────────────

async function seedRiskAppetite(userId: number) {
  console.log('[20] Seeding risk_appetite_mappings, risk_appetite_bands...');
  const [exM] = await db.select().from(schema.riskAppetiteMappings).where(eq(schema.riskAppetiteMappings.mapping_name, 'Standard Philippine Risk Appetite Map v1')).limit(1);
  let mapId: number;
  if (exM) { mapId = exM.id; }
  else {
    const [ins] = await db.insert(schema.riskAppetiteMappings).values({
      mapping_name: 'Standard Philippine Risk Appetite Map v1',
      entity_id: 'default',
      effective_start_date: '2024-01-01',
      effective_end_date: '2027-12-31',
      authorization_status: 'AUTHORIZED',
      maker_id: userId, checker_id: userId,
      authorized_at: new Date('2024-01-01'),
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    mapId = ins.id;
  }

  const bands = [
    { from: '0', to: '20', category: 'CONSERVATIVE', code: 1, desc: 'Capital preservation focused, very low risk tolerance' },
    { from: '20', to: '40', category: 'MODERATE', code: 2, desc: 'Income focused, low-to-moderate risk tolerance' },
    { from: '40', to: '60', category: 'BALANCED', code: 3, desc: 'Balanced growth and income, moderate risk tolerance' },
    { from: '60', to: '80', category: 'GROWTH', code: 4, desc: 'Growth focused, above-average risk tolerance' },
    { from: '80', to: '100', category: 'AGGRESSIVE', code: 5, desc: 'Maximum growth, high risk tolerance' },
  ];
  let bSeeded = 0;
  for (const b of bands) {
    const [ex] = await db.select().from(schema.riskAppetiteBands)
      .where(sql`mapping_id = ${mapId} AND risk_code = ${b.code}`).limit(1);
    if (!ex) {
      await db.insert(schema.riskAppetiteBands).values({
        mapping_id: mapId, score_from: b.from, score_to: b.to,
        risk_category: b.category, risk_code: b.code, description: b.desc,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      bSeeded++;
    }
  }
  console.log(`  → 1 mapping, ${bSeeded} bands seeded`);
  return mapId;
}

// ── 21. asset_allocation_configs → lines ─────────────────────────────────────

async function seedAssetAllocation(userId: number) {
  console.log('[21] Seeding asset_allocation_configs, asset_allocation_lines...');
  const [exC] = await db.select().from(schema.assetAllocationConfigs).where(eq(schema.assetAllocationConfigs.config_name, 'Standard Asset Allocation Config v1')).limit(1);
  let configId: number;
  if (exC) { configId = exC.id; }
  else {
    const [ins] = await db.insert(schema.assetAllocationConfigs).values({
      config_name: 'Standard Asset Allocation Config v1',
      entity_id: 'default',
      effective_start_date: '2024-01-01',
      effective_end_date: '2027-12-31',
      authorization_status: 'AUTHORIZED',
      maker_id: userId, checker_id: userId,
      authorized_at: new Date('2024-01-01'),
      created_by_user_id: userId, updated_by_user_id: userId,
    }).returning();
    configId = ins.id;
  }

  const lines = [
    { cat: 'CONSERVATIVE', asset: 'FIXED_INCOME', pct: '70', ret: '4.5', std: '2.0' },
    { cat: 'CONSERVATIVE', asset: 'CASH', pct: '25', ret: '2.5', std: '0.5' },
    { cat: 'CONSERVATIVE', asset: 'EQUITY', pct: '5', ret: '8.0', std: '15.0' },
    { cat: 'MODERATE', asset: 'FIXED_INCOME', pct: '50', ret: '4.5', std: '2.0' },
    { cat: 'MODERATE', asset: 'EQUITY', pct: '30', ret: '8.0', std: '15.0' },
    { cat: 'MODERATE', asset: 'CASH', pct: '20', ret: '2.5', std: '0.5' },
    { cat: 'BALANCED', asset: 'EQUITY', pct: '50', ret: '8.0', std: '15.0' },
    { cat: 'BALANCED', asset: 'FIXED_INCOME', pct: '40', ret: '4.5', std: '2.0' },
    { cat: 'BALANCED', asset: 'CASH', pct: '10', ret: '2.5', std: '0.5' },
    { cat: 'GROWTH', asset: 'EQUITY', pct: '70', ret: '8.0', std: '15.0' },
    { cat: 'GROWTH', asset: 'FIXED_INCOME', pct: '25', ret: '4.5', std: '2.0' },
    { cat: 'GROWTH', asset: 'CASH', pct: '5', ret: '2.5', std: '0.5' },
    { cat: 'AGGRESSIVE', asset: 'EQUITY', pct: '90', ret: '10.0', std: '22.0' },
    { cat: 'AGGRESSIVE', asset: 'FIXED_INCOME', pct: '10', ret: '4.5', std: '2.0' },
    { cat: 'AGGRESSIVE', asset: 'CASH', pct: '0', ret: '0', std: '0' },
  ];
  let lSeeded = 0;
  for (const l of lines) {
    const [ex] = await db.select().from(schema.assetAllocationLines)
      .where(sql`config_id = ${configId} AND risk_category = ${l.cat} AND asset_class = ${l.asset}`).limit(1);
    if (!ex && parseFloat(l.pct) > 0) {
      await db.insert(schema.assetAllocationLines).values({
        config_id: configId, risk_category: l.cat, asset_class: l.asset,
        allocation_percentage: l.pct, expected_return_pct: l.ret, standard_deviation_pct: l.std,
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      lSeeded++;
    }
  }
  console.log(`  → 1 config, ${lSeeded} allocation lines seeded`);
}

// ── 22. rp_model_portfolios ───────────────────────────────────────────────────

async function seedRpModelPortfolios(userId: number) {
  console.log('[22] Seeding rp_model_portfolios...');
  const portfolios = [
    { portfolio_name: 'Conservative Model Portfolio', risk_category: 'CONSERVATIVE', benchmark_index: 'PDEX', rebalance_frequency: 'QUARTERLY' as const, drift_threshold_pct: '5.00' },
    { portfolio_name: 'Moderate Model Portfolio', risk_category: 'MODERATE', benchmark_index: 'PDEX', rebalance_frequency: 'QUARTERLY' as const, drift_threshold_pct: '5.00' },
    { portfolio_name: 'Balanced Model Portfolio', risk_category: 'BALANCED', benchmark_index: 'PSEi', rebalance_frequency: 'SEMI_ANNUAL' as const, drift_threshold_pct: '7.50' },
    { portfolio_name: 'Growth Model Portfolio', risk_category: 'GROWTH', benchmark_index: 'PSEi', rebalance_frequency: 'SEMI_ANNUAL' as const, drift_threshold_pct: '10.00' },
    { portfolio_name: 'Aggressive Growth Model Portfolio', risk_category: 'AGGRESSIVE', benchmark_index: 'MSCI_EM', rebalance_frequency: 'ANNUAL' as const, drift_threshold_pct: '15.00' },
  ];
  let seeded = 0;
  for (const p of portfolios) {
    const [ex] = await db.select().from(schema.rpModelPortfolios).where(eq(schema.rpModelPortfolios.portfolio_name, p.portfolio_name)).limit(1);
    if (!ex) {
      await db.insert(schema.rpModelPortfolios).values({
        ...p, entity_id: 'default', is_active: true,
        authorization_status: 'AUTHORIZED',
        created_by_user_id: userId, updated_by_user_id: userId,
      });
      seeded++;
    }
  }
  console.log(`  → ${seeded} RP model portfolios seeded`);
}

// ── 23. model_portfolios ──────────────────────────────────────────────────────

async function seedModelPortfolios(userId: number) {
  console.log('[23] Seeding model_portfolios...');
  const portfolios = [
    { name: 'Conservative Blend', description: 'Low-risk portfolio for capital preservation', allocations: [{ asset_class: 'FIXED_INCOME', target_pct: 70, min_pct: 60, max_pct: 80 }, { asset_class: 'CASH', target_pct: 25, min_pct: 15, max_pct: 35 }, { asset_class: 'EQUITY', target_pct: 5, min_pct: 0, max_pct: 10 }] },
    { name: 'Balanced Growth', description: 'Balanced portfolio for moderate investors', allocations: [{ asset_class: 'EQUITY', target_pct: 50, min_pct: 40, max_pct: 60 }, { asset_class: 'FIXED_INCOME', target_pct: 40, min_pct: 30, max_pct: 50 }, { asset_class: 'CASH', target_pct: 10, min_pct: 5, max_pct: 15 }] },
    { name: 'Equity-Led Growth', description: 'Equity-dominated portfolio for growth investors', allocations: [{ asset_class: 'EQUITY', target_pct: 75, min_pct: 65, max_pct: 85 }, { asset_class: 'FIXED_INCOME', target_pct: 20, min_pct: 10, max_pct: 30 }, { asset_class: 'CASH', target_pct: 5, min_pct: 0, max_pct: 10 }] },
  ];
  let seeded = 0;
  for (const p of portfolios) {
    const [ex] = await db.select().from(schema.modelPortfolios).where(eq(schema.modelPortfolios.name, p.name)).limit(1);
    if (!ex) {
      await db.insert(schema.modelPortfolios).values({ ...p, is_active: true, created_by_user_id: userId, updated_by_user_id: userId });
      seeded++;
    }
  }
  console.log(`  → ${seeded} model portfolios seeded`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TrustOMS — Group A: Reference / Config Seed                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Target: ${process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@')}`);

  const userId = await getUserId();
  console.log(`[DB] Using admin user id: ${userId}`);

  await seedSystemConfig();
  await seedNotificationTemplates();
  await seedSlaConfigurations();
  await seedApprovalWorkflows();
  await seedRbac();
  const { headIds, auId } = await seedGlStructure(userId);
  const fundIds = await seedFundMaster(userId, auId);
  await seedGlMappings(userId, headIds);
  await seedGlRuleEngine(userId, headIds);
  await seedGlAuthMatrix(userId);
  await seedGlFinancialCalendar(userId);
  await seedGlReports(userId);
  await seedFxRates(userId);
  await seedComplianceLimits(userId);
  await seedDedupeAndNegativeList(userId);
  await seedContentPacks(userId);
  await seedRegulatoryCalendar(userId);
  await seedScrutinyTemplates(userId);
  const questionnaireId = await seedRiskProfilingReference(userId);
  await seedRiskAppetite(userId);
  await seedAssetAllocation(userId);
  await seedRpModelPortfolios(userId);
  await seedModelPortfolios(userId);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Group A seed completed successfully!                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

export { main as seedGroupA };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => { console.error('\n[ERROR] Group A seed failed:', err?.cause?.message ?? err?.message ?? err); process.exit(1); });
}
