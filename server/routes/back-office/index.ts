/**
 * Back-Office CRUD Route Registration
 *
 * Registers all entity CRUD routes for the back-office API.
 * Each route uses createCrudRouter or createNestedCrudRouter
 * with entity-specific configuration.
 *
 * All routes are guarded by requireBackOfficeRole middleware.
 */

import { Router, Request } from 'express';
import { createCrudRouter } from '../crud-factory';
import { createNestedCrudRouter } from '../nested-crud-factory';
import { requireBackOfficeRole } from '../../middleware/role-auth';
import { logDataAccess } from '../../middleware/role-auth';
import * as schema from '@shared/schema';
import { db } from '../../db';
import { eq, and, count, inArray } from 'drizzle-orm';
import { dedupeService } from '../../services/dedupe-service';
import meetingRoutes from './meetings';
import callReportsCustomRoutes from './call-reports-custom';
import crApprovalsRoutes from './cr-approvals';
import callReportRoutes from './call-reports';
import expenseRoutes from './expenses';
import opportunityRoutes from './opportunities';
import systemConfigRoutes from './system-config';
import clientMessageRoutes from './client-messages';
import boStatementRoutes from './statements';
import featureRoutes from './features';
import intelligenceRoutes from './intelligence';
import trustAccountRoutes from './trust-accounts';
import loanRoutes from './loans';
import ebtRoutes from './ebt';
import accountMgmtRoutes from './account-management';
import operationsExtRoutes from './operations-extended';
import gapClosureRoutes from './gap-closures';
import gapClosureP2Routes from './gap-closures-p2';
import fiduciaryExtRoutes from './fiduciary-extensions';
import metrobankExtRoutes from './metrobank-extensions';
import metrobankPartialExtRoutes from './metrobank-partial-extensions';

const router = Router();

// Apply back-office role guard to all routes
router.use(requireBackOfficeRole());

// ============================================================================
// Reference Data
// ============================================================================

router.use(
  '/countries',
  createCrudRouter(schema.countries, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'countries',
    makerChecker: 'countries',
  }),
);

router.use(
  '/currencies',
  createCrudRouter(schema.currencies, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'currencies',
    makerChecker: 'currencies',
  }),
);

router.use(
  '/asset-classes',
  createCrudRouter(schema.assetClasses, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'asset-classes',
    makerChecker: 'asset-classes',
  }),
);

router.use(
  '/branches',
  createCrudRouter(schema.branches, {
    searchableColumns: ['code', 'name', 'region'],
    defaultSort: 'name',
    entityKey: 'branches',
    makerChecker: 'branches',
  }),
);

router.use(
  '/exchanges',
  createCrudRouter(schema.exchanges, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'exchanges',
    makerChecker: 'exchanges',
  }),
);

router.use(
  '/trust-product-types',
  createCrudRouter(schema.trustProductTypes, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'name',
    entityKey: 'trust-product-types',
    makerChecker: 'trust-product-types',
  }),
);

router.use(
  '/fee-types',
  createCrudRouter(schema.feeTypes, {
    searchableColumns: ['code', 'name'],
    defaultSort: 'code',
    entityKey: 'fee-types',
    makerChecker: 'fee-types',
  }),
);

router.use(
  '/tax-codes',
  createCrudRouter(schema.taxCodes, {
    searchableColumns: ['code', 'name', 'type'],
    defaultSort: 'code',
    entityKey: 'tax-codes',
    makerChecker: 'tax-codes',
  }),
);

router.use(
  '/market-calendar',
  createCrudRouter(schema.marketCalendar, {
    searchableColumns: ['calendar_key', 'holiday_name'],
    defaultSort: 'date',
    entityKey: 'market-calendar',
    makerChecker: 'market-calendar',
  }),
);

router.use(
  '/legal-entities',
  createCrudRouter(schema.legalEntities, {
    searchableColumns: ['entity_code', 'entity_name'],
    defaultSort: 'entity_code',
    entityKey: 'legal-entities',
    makerChecker: 'legal-entities',
  }),
);

router.use(
  '/feed-routing',
  createCrudRouter(schema.feedRouting, {
    searchableColumns: ['security_segment'],
    defaultSort: 'id',
    entityKey: 'feed-routing',
    makerChecker: 'feed-routing',
  }),
);

router.use(
  '/data-stewardship',
  createCrudRouter(schema.dataStewardship, {
    searchableColumns: ['dataset_key'],
    defaultSort: 'dataset_key',
    entityKey: 'data-stewardship',
    makerChecker: 'data-stewardship',
  }),
);

// ============================================================================
// Master Data
// ============================================================================

router.use(
  '/counterparties',
  createCrudRouter(schema.counterparties, {
    searchableColumns: ['name', 'lei', 'bic', 'type'],
    defaultSort: 'name',
    entityKey: 'counterparties',
    makerChecker: 'counterparties',
  }),
);

router.use(
  '/brokers',
  createCrudRouter(schema.brokers, {
    searchableColumns: [],
    defaultSort: 'id',
    entityKey: 'brokers',
    makerChecker: 'brokers',
  }),
);

router.use(
  '/securities',
  createCrudRouter(schema.securities, {
    searchableColumns: ['name', 'isin', 'cusip', 'sedol', 'bloomberg_ticker', 'local_code'],
    defaultSort: 'name',
    entityKey: 'securities',
    makerChecker: 'securities',
  }),
);

router.use(
  '/portfolios',
  createCrudRouter(schema.portfolios, {
    searchableColumns: ['portfolio_id', 'client_id'],
    defaultSort: 'portfolio_id',
    entityKey: 'portfolios',
    makerChecker: 'portfolios',
  }),
);

router.use('/trust-accounts', trustAccountRoutes);
router.use('/loans', loanRoutes);
router.use('/ebt', ebtRoutes);
router.use('/account-management', accountMgmtRoutes);
router.use('/operations', operationsExtRoutes);
router.use('/gap-closures', gapClosureRoutes);
router.use('/gap-closures-p2', gapClosureP2Routes);
router.use('/fiduciary', fiduciaryExtRoutes);
router.use('/metrobank', metrobankExtRoutes);
router.use('/metrobank-ext', metrobankPartialExtRoutes);

// Clients — PII logging enabled
router.use(
  '/clients',
  logDataAccess('clients'),
  createCrudRouter(schema.clients, {
    searchableColumns: ['client_id', 'legal_name', 'type'],
    defaultSort: 'legal_name',
    entityKey: 'clients',
    makerChecker: 'clients',
  }),
);

router.use(
  '/users',
  createCrudRouter(schema.users, {
    searchableColumns: ['username', 'full_name', 'email', 'role'],
    defaultSort: 'username',
    entityKey: 'users',
    makerChecker: 'users',
    omitFromInsert: ['password_hash', 'last_login'],
    omitFromResponse: ['password_hash'],
  }),
);

// ============================================================================
// Nested Routes (sub-resources scoped to parent)
// ============================================================================

// Client sub-entities
router.use(
  '/clients/:parentId/profiles',
  logDataAccess('client-profiles'),
  createNestedCrudRouter(schema.clientProfiles, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['risk_tolerance', 'investment_horizon'],
    entityKey: 'client-profiles',
  }),
);

router.use(
  '/clients/:parentId/kyc-cases',
  logDataAccess('kyc-cases'),
  createNestedCrudRouter(schema.kycCases, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['risk_rating', 'id_type'],
    entityKey: 'kyc-cases',
  }),
);

router.use(
  '/clients/:parentId/beneficial-owners',
  logDataAccess('beneficial-owners'),
  createNestedCrudRouter(schema.beneficialOwners, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    searchableColumns: ['ubo_name'],
    entityKey: 'beneficial-owners',
  }),
);

router.use(
  '/clients/:parentId/fatca-crs',
  logDataAccess('fatca-crs'),
  createNestedCrudRouter(schema.clientFatcaCrs, {
    parentTable: schema.clients,
    parentFkColumn: 'client_id',
    entityKey: 'fatca-crs',
  }),
);

// Portfolio sub-entities
router.use(
  '/portfolios/:parentId/mandates',
  createNestedCrudRouter(schema.mandates, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    entityKey: 'mandates',
  }),
);

router.use(
  '/portfolios/:parentId/fee-schedules',
  createNestedCrudRouter(schema.feeSchedules, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    searchableColumns: ['fee_type', 'calculation_method'],
    entityKey: 'fee-schedules',
  }),
);

router.use(
  '/portfolios/:parentId/positions',
  createNestedCrudRouter(schema.positions, {
    parentTable: schema.portfolios,
    parentFkColumn: 'portfolio_id',
    entityKey: 'positions',
  }),
);

// ============================================================================
// Workflow Definitions (approval workflows)
// ============================================================================

router.use(
  '/workflow-definitions',
  createCrudRouter(schema.approvalWorkflowDefinitions, {
    searchableColumns: ['entity_type', 'action'],
    defaultSort: 'entity_type',
    entityKey: 'workflow-definitions',
  }),
);

// ============================================================================
// BDO RFI Gap Entities
// ============================================================================

router.use(
  '/model-portfolios',
  createCrudRouter(schema.modelPortfolios, {
    searchableColumns: ['name'],
    defaultSort: 'name',
    entityKey: 'model-portfolios',
    makerChecker: 'model-portfolios',
  }),
);

router.use(
  '/compliance-limits',
  createCrudRouter(schema.complianceLimits, {
    searchableColumns: ['limit_type', 'dimension', 'dimension_id'],
    defaultSort: 'limit_type',
    entityKey: 'compliance-limits',
    makerChecker: 'compliance-limits',
  }),
);

router.use(
  '/scheduled-plans',
  createCrudRouter(schema.scheduledPlans, {
    searchableColumns: ['client_id', 'portfolio_id', 'plan_type'],
    defaultSort: 'id',
    entityKey: 'scheduled-plans',
    makerChecker: 'scheduled-plans',
  }),
);

router.use(
  '/pera-accounts',
  logDataAccess('pera-accounts'),
  createCrudRouter(schema.peraAccounts, {
    searchableColumns: ['contributor_id', 'administrator', 'bsp_pera_id'],
    defaultSort: 'id',
    entityKey: 'pera-accounts',
    makerChecker: 'pera-accounts',
  }),
);

router.use(
  '/held-away-assets',
  createCrudRouter(schema.heldAwayAssets, {
    searchableColumns: ['portfolio_id', 'asset_class', 'custodian'],
    defaultSort: 'portfolio_id',
    entityKey: 'held-away-assets',
    makerChecker: 'held-away-assets',
  }),
);

router.use(
  '/standing-instructions',
  createCrudRouter(schema.standingInstructions, {
    searchableColumns: ['account_id', 'portfolio_id', 'instruction_type'],
    defaultSort: 'id',
    entityKey: 'standing-instructions',
    makerChecker: 'standing-instructions',
  }),
);

// PERA sub-entities
router.use(
  '/pera-accounts/:parentId/transactions',
  logDataAccess('pera-transactions'),
  createNestedCrudRouter(schema.peraTransactions, {
    parentTable: schema.peraAccounts,
    parentFkColumn: 'pera_account_id',
    searchableColumns: ['type'],
    entityKey: 'pera-transactions',
  }),
);

// ============================================================================
// BRD Philippines — New CRUD Routes (Phase 1A)
// ============================================================================

router.use(
  '/settlement-account-configs',
  createCrudRouter(schema.settlementAccountConfigs, {
    searchableColumns: ['trust_account_id', 'ssi_id', 'currency'],
    defaultSort: 'id',
    entityKey: 'settlement-account-configs',
    makerChecker: 'settlement-account-configs',
  }),
);

router.use(
  '/broker-charge-schedules',
  createCrudRouter(schema.brokerChargeSchedules, {
    searchableColumns: ['asset_class'],
    defaultSort: 'id',
    entityKey: 'broker-charge-schedules',
    makerChecker: 'broker-charge-schedules',
  }),
);

router.use(
  '/cash-sweep-rules',
  createCrudRouter(schema.cashSweepRules, {
    searchableColumns: ['account_id', 'target_fund_id'],
    defaultSort: 'id',
    entityKey: 'cash-sweep-rules',
    makerChecker: 'cash-sweep-rules',
  }),
);

router.use(
  '/derivative-setups',
  createCrudRouter(schema.derivativeSetups, {
    searchableColumns: ['underlier', 'instrument_type'],
    defaultSort: 'id',
    entityKey: 'derivative-setups',
    makerChecker: 'derivative-setups',
  }),
);

router.use(
  '/sanctions-screening',
  createCrudRouter(schema.sanctionsScreeningLog, {
    searchableColumns: ['entity_id', 'screened_name', 'provider'],
    defaultSort: 'id',
    entityKey: 'sanctions-screening',
  }),
);

router.use(
  '/stress-test-results',
  createCrudRouter(schema.stressTestResults, {
    searchableColumns: ['scenario_id', 'scenario_name', 'portfolio_id'],
    defaultSort: 'run_date',
    defaultSortOrder: 'desc',
    entityKey: 'stress-test-results',
  }),
);

// ============================================================================
// CRM Campaign Management
// ============================================================================

function assertEventCampaignFields(data: Record<string, unknown>, campaignType = data.campaign_type): void {
  if (campaignType === 'EVENT_INVITATION') {
    if (!data.event_name) throw new Error('event_name is required for EVENT_INVITATION campaigns');
    if (!data.event_date) throw new Error('event_date is required for EVENT_INVITATION campaigns');
    if (!data.event_venue) throw new Error('event_venue is required for EVENT_INVITATION campaigns');
  }
}

router.use(
  '/campaigns',
  createCrudRouter(schema.campaigns, {
    searchableColumns: ['campaign_code', 'name', 'campaign_type'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'campaigns',
    makerChecker: 'campaigns',
    beforeCreate: async (data: unknown, _req: Request) => {
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        // BRD CAMP-010: end_date must be >= start_date
        if (d.start_date && d.end_date && String(d.end_date) < String(d.start_date)) {
          throw new Error('end_date must be on or after start_date');
        }
        // BRD CAMP-010: budget must be >= 0
        if (d.budget_amount !== undefined && Number(d.budget_amount) < 0) {
          throw new Error('budget_amount must be zero or positive');
        }
        // BRD CAMP-009: EVENT_INVITATION requires event_name, event_date, and event_venue
        assertEventCampaignFields(d);
        // BRD G-011: campaign name must be unique
        if (d.name) {
          const [dup] = await db
            .select({ id: schema.campaigns.id })
            .from(schema.campaigns)
            .where(and(eq(schema.campaigns.name, String(d.name)), eq(schema.campaigns.is_deleted, false)))
            .limit(1);
          if (dup) throw new Error(`A campaign with the name "${d.name}" already exists`);
        }
      }
    },
    beforeUpdate: async (data: unknown, req: Request) => {
      const id = parseInt(req.params.id ?? '', 10);
      if (!isNaN(id) && data && typeof data === 'object') {
        const [current] = await db
          .select({
            campaign_status: schema.campaigns.campaign_status,
            campaign_type: schema.campaigns.campaign_type,
            event_name: schema.campaigns.event_name,
            event_date: schema.campaigns.event_date,
            event_venue: schema.campaigns.event_venue,
          })
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, id));
        // BRD CAMP-014: block mutations on COMPLETED/ARCHIVED campaigns
        if (current?.campaign_status === 'COMPLETED' || current?.campaign_status === 'ARCHIVED') {
          throw new Error(`Cannot modify a campaign in ${current.campaign_status} status`);
        }
        // BRD G-015: editing an ACTIVE campaign reverts it to PENDING_APPROVAL for re-approval
        if (current?.campaign_status === 'ACTIVE') {
          (data as Record<string, unknown>).campaign_status = 'PENDING_APPROVAL';
        }
        // BRD CAMP-010: end_date must be >= start_date
        const d = data as Record<string, unknown>;
        if (d.start_date && d.end_date && String(d.end_date) < String(d.start_date)) {
          throw new Error('end_date must be on or after start_date');
        }
        if (d.budget_amount !== undefined && Number(d.budget_amount) < 0) {
          throw new Error('budget_amount must be zero or positive');
        }
        assertEventCampaignFields({
          campaign_type: d.campaign_type ?? current?.campaign_type,
          event_name: d.event_name ?? current?.event_name,
          event_date: d.event_date ?? current?.event_date,
          event_venue: d.event_venue ?? current?.event_venue,
        }, d.campaign_type ?? current?.campaign_type);
        // G-016: Budget increase on APPROVED/PENDING_APPROVAL campaign triggers re-approval
        if (d.budget_amount !== undefined && (current?.campaign_status === 'APPROVED' || current?.campaign_status === 'PENDING_APPROVAL')) {
          const [full] = await db.select({ budget_amount: schema.campaigns.budget_amount }).from(schema.campaigns).where(eq(schema.campaigns.id, id));
          if (full && Number(d.budget_amount) > Number(full.budget_amount ?? 0)) {
            (data as Record<string, unknown>).campaign_status = 'PENDING_APPROVAL';
          }
        }
      }
    },
  }),
);

router.use(
  '/lead-lists',
  createCrudRouter(schema.leadLists, {
    searchableColumns: ['list_code', 'name', 'source_type'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'lead-lists',
    // BRD G-008: block deletion if list is assigned to any ACTIVE campaign
    beforeDelete: async ({ id }) => {
      const numericId = Number(id);
      if (isNaN(numericId)) return;
      const [assignment] = await db
        .select({ id: schema.campaignLists.id })
        .from(schema.campaignLists)
        .innerJoin(schema.campaigns, eq(schema.campaignLists.campaign_id, schema.campaigns.id))
        .where(and(
          eq(schema.campaignLists.lead_list_id, numericId),
          inArray(schema.campaigns.campaign_status, ['ACTIVE', 'APPROVED', 'PENDING_APPROVAL']),
        ))
        .limit(1);
      if (assignment) throw new Error('Cannot delete a lead list that is assigned to an active or pending campaign');
    },
  }),
);

router.use(
  '/leads',
  logDataAccess('leads'),
  createCrudRouter(schema.leads, {
    searchableColumns: ['lead_code', 'first_name', 'last_name', 'email', 'company_name'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'leads',
    // CM G-006: invoke dedup check on manual lead creation via CRUD router
    beforeCreate: async (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (d.first_name || d.last_name || d.email) {
        const dedupResult = await dedupeService.checkDedupe(
          { first_name: String(d.first_name ?? ''), last_name: String(d.last_name ?? ''), email: d.email ? String(d.email) : undefined, mobile_phone: d.mobile_phone ? String(d.mobile_phone) : undefined },
          String(d.entity_type ?? 'INDIVIDUAL'),
        );
        if (dedupResult.has_hard_stop || dedupResult.matches.length > 0) {
          throw new Error(`Duplicate lead detected (${dedupResult.matches.length} match(es) found). Use the dedup resolution flow or verify this is a new person.`);
        }
      }
    },
  }),
);

router.use(
  '/lead-list-members',
  createCrudRouter(schema.leadListMembers, {
    searchableColumns: [],
    defaultSort: 'id',
    entityKey: 'lead-list-members',
  }),
);

router.use(
  '/campaign-lists',
  createCrudRouter(schema.campaignLists, {
    searchableColumns: [],
    defaultSort: 'id',
    entityKey: 'campaign-lists',
  }),
);

router.use(
  '/campaign-responses',
  createCrudRouter(schema.campaignResponses, {
    searchableColumns: ['response_type', 'response_channel'],
    defaultSort: 'response_date',
    defaultSortOrder: 'desc',
    entityKey: 'campaign-responses',
    beforeCreate: async (data: unknown) => {
      const d = data as Record<string, unknown>;
      const { campaign_id, lead_id } = d;
      if (campaign_id !== undefined && lead_id !== undefined) {
        // CM-GAP-021: One response per lead per campaign
        const [existing] = await db
          .select({ id: schema.campaignResponses.id })
          .from(schema.campaignResponses)
          .where(and(
            eq(schema.campaignResponses.campaign_id, Number(campaign_id)),
            eq(schema.campaignResponses.lead_id, Number(lead_id)),
            eq(schema.campaignResponses.is_deleted, false),
          ))
          .limit(1);
        if (existing) throw new Error('Lead already has a response for this campaign');

        // CM-GAP-018: Allow response capture within 7-day grace period after COMPLETED
        const [campaign] = await db
          .select({ campaign_status: schema.campaigns.campaign_status, end_date: schema.campaigns.end_date })
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, Number(campaign_id)))
          .limit(1);
        if (campaign) {
          if (campaign.campaign_status === 'ARCHIVED') throw new Error('Cannot capture responses for ARCHIVED campaigns');
          if (campaign.campaign_status === 'COMPLETED' && campaign.end_date) {
            const graceCutoff = new Date(campaign.end_date);
            graceCutoff.setDate(graceCutoff.getDate() + 7);
            if (new Date() > graceCutoff) throw new Error('Response capture window has closed (7-day grace period after campaign completion has passed)');
          }
        }
      }
    },
  }),
);

router.use(
  '/campaign-communications',
  createCrudRouter(schema.campaignCommunications, {
    searchableColumns: ['subject', 'channel'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'campaign-communications',
  }),
);

router.use(
  '/prospects',
  logDataAccess('prospects'),
  createCrudRouter(schema.prospects, {
    searchableColumns: ['prospect_code', 'first_name', 'last_name', 'email', 'company_name'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'prospects',
    makerChecker: 'prospects',
  }),
);

// Custom meeting routes (complete, cancel, reschedule, calendar, invitees) — mount before CRUD
router.use('/meetings', meetingRoutes);
router.use(
  '/meetings',
  createCrudRouter(schema.meetings, {
    searchableColumns: ['meeting_code', 'title'],
    defaultSort: 'start_time',
    defaultSortOrder: 'desc',
    entityKey: 'meetings',
  }),
);

router.use(
  '/meeting-invitees',
  createCrudRouter(schema.meetingInvitees, {
    searchableColumns: [],
    defaultSort: 'id',
    entityKey: 'meeting-invitees',
  }),
);

// Custom call report routes (feedback, chain, approval queue, submit, search) — mount before CRUD
router.use('/call-reports', callReportsCustomRoutes);
router.use('/call-reports', callReportRoutes);
router.use(
  '/call-reports',
  createCrudRouter(schema.callReports, {
    searchableColumns: ['report_code', 'subject'],
    defaultSort: 'meeting_date',
    defaultSortOrder: 'desc',
    entityKey: 'call-reports',
  }),
);

// Call report approval workflow routes (late-filing supervisor approvals)
router.use('/cr-approvals', crApprovalsRoutes);

// CRM Expenses (FR-020 — P0-01)
router.use('/expenses', expenseRoutes);

// Opportunity pipeline routes (includes bulk-upload — FR-017 P0-05) — mount before CRUD
router.use('/opportunities', opportunityRoutes);
router.use(
  '/opportunities',
  createCrudRouter(schema.opportunities, {
    searchableColumns: ['opportunity_code', 'name'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'opportunities',
  }),
);

// CRM Expense feedback (read-only CRUD)
router.use(
  '/call-report-feedback',
  createCrudRouter(schema.callReportFeedback, {
    searchableColumns: ['comment', 'feedback_type'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'call-report-feedback',
  }),
);

router.use(
  '/action-items',
  createCrudRouter(schema.actionItems, {
    searchableColumns: ['description', 'priority'],
    defaultSort: 'due_date',
    entityKey: 'action-items',
  }),
);

router.use(
  '/rm-handovers',
  createCrudRouter(schema.rmHandovers, {
    searchableColumns: ['entity_type', 'reason'],
    defaultSort: 'effective_date',
    defaultSortOrder: 'desc',
    entityKey: 'rm-handovers',
    makerChecker: 'rm-handovers',
  }),
);

router.use(
  '/notification-templates',
  createCrudRouter(schema.notificationTemplates, {
    searchableColumns: ['template_code', 'name', 'channel'],
    defaultSort: 'name',
    entityKey: 'notification-templates',
    // Campaign BRD BR3: Email templates must include an unsubscribe link token
    beforeCreate: async (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (d.channel === 'EMAIL' && typeof d.body_template === 'string') {
        if (!d.body_template.includes('{{unsubscribe_link}}') && !d.body_template.includes('{{unsubscribe_url}}')) {
          throw new Error('Email templates must include an unsubscribe link token: {{unsubscribe_link}} or {{unsubscribe_url}}');
        }
      }
    },
    beforeUpdate: async (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (d.channel === 'EMAIL' && typeof d.body_template === 'string') {
        if (!d.body_template.includes('{{unsubscribe_link}}') && !d.body_template.includes('{{unsubscribe_url}}')) {
          throw new Error('Email templates must include an unsubscribe link token: {{unsubscribe_link}} or {{unsubscribe_url}}');
        }
      }
    },
  }),
);

router.use(
  '/call-report-approvals',
  createCrudRouter(schema.callReportApprovals, {
    searchableColumns: ['reviewer_comments'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'call-report-approvals',
  }),
);

router.use(
  '/conversation-history',
  createCrudRouter(schema.conversationHistory, {
    searchableColumns: ['summary'],
    defaultSort: 'interaction_date',
    defaultSortOrder: 'desc',
    entityKey: 'conversation-history',
  }),
);

router.use('/system-config', systemConfigRoutes);
router.use('/statements', boStatementRoutes);

router.use('/client-messages', clientMessageRoutes);

router.use(
  '/lead-upload-batches',
  createCrudRouter(schema.leadUploadBatches, {
    searchableColumns: ['batch_code', 'file_name'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'lead-upload-batches',
  }),
);

router.use(
  '/campaign-consent-log',
  logDataAccess('campaign-consent'),
  createCrudRouter(schema.campaignConsentLog, {
    searchableColumns: ['consent_type', 'consent_status'],
    defaultSort: 'id',
    defaultSortOrder: 'desc',
    entityKey: 'campaign-consent-log',
  }),
);

router.use(
  '/campaign-translations',
  createCrudRouter(schema.campaignTranslations, {
    searchableColumns: ['locale', 'name'],
    defaultSort: 'id',
    entityKey: 'campaign-translations',
  }),
);

// ─── Platform Services ────────────────────────────────────────────────────────

router.use('/features',      featureRoutes);
router.use('/intelligence',  intelligenceRoutes);

export default router;
