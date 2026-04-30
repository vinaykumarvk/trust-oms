import type { Express } from 'express';
import entityRegistryRouter from './routes/entity-registry';
import backOfficeRouter from './routes/back-office';
import approvalsRouter from './routes/back-office/approvals';
import auditRouter from './routes/back-office/audit';
import kycRouter from './routes/back-office/kyc';
import suitabilityRouter from './routes/suitability';
import ordersRouter from './routes/orders';
import tradesRouter from './routes/trades';
import confirmationsRouter from './routes/confirmations';
import rmDashboardRouter from './routes/rm-dashboard';
import navRouter from './routes/nav';
import settlementsRouter from './routes/settlements';
import eodRouter from './routes/back-office/eod';
import reconRouter from './routes/back-office/reconciliation';
import corporateActionsRouter from './routes/back-office/corporate-actions';
import feesRouter from './routes/back-office/fees';
import eligibilityExpressionsRouter from './routes/back-office/eligibility-expressions';
import taxRouter from './routes/back-office/tax';
import ttraRouter from './routes/back-office/ttra';
import reversalsRouter from './routes/back-office/reversals';
import uploadsRouter from './routes/back-office/uploads';
import transfersRouter from './routes/back-office/transfers';
import contributionsRouter from './routes/back-office/contributions';
import withdrawalsRouter from './routes/back-office/withdrawals';
import complianceLimitsRouter from './routes/back-office/compliance-limits';
import rebalancingRouter from './routes/back-office/rebalancing';
import scheduledPlansRouter from './routes/back-office/scheduled-plans';
import peraRouter from './routes/back-office/pera';
import riskAnalyticsRouter from './routes/back-office/risk-analytics';
import complianceWorkbenchRouter from './routes/back-office/compliance';
import surveillanceRouter from './routes/back-office/surveillance';
import killSwitchRouter from './routes/kill-switch';
import oreRouter from './routes/back-office/ore';
import whistleblowerRouter from './routes/whistleblower';
import executiveRouter from './routes/executive';
import reportsRouter from './routes/back-office/reports';
import notificationsRouter from './routes/notifications';
import clientPortalRouter from './routes/client-portal';
import integrationsRouter from './routes/back-office/integrations';
import realtimeRouter from './routes/realtime';
import scenarioRouter from './routes/scenario';
import aiRouter from './routes/ai';
import { pricingDefinitionsRouter } from './routes/back-office/pricing-definitions';
import accrualSchedulesRouter from './routes/back-office/accrual-schedules';
import feePlanTemplatesRouter from './routes/back-office/fee-plan-templates';
import feePlansRouter from './routes/back-office/fee-plans';
import tfpAccrualsRouter from './routes/back-office/tfp-accruals';
import tfpInvoicesRouter from './routes/back-office/tfp-invoices';
import tfpPaymentsRouter from './routes/back-office/tfp-payments';
import tfpAdhocFeesRouter from './routes/back-office/tfp-adhoc-fees';
import claimsRouter from './routes/back-office/claims';
import feeOverridesRouter from './routes/back-office/fee-overrides';
import exceptionsRouter from './routes/back-office/exceptions';
import consentRouter from './routes/back-office/consent';
import degradedModeRouter from './routes/back-office/degraded-mode';
import tfpAuditRouter from './routes/back-office/tfp-audit';
import disputesRouter from './routes/back-office/disputes';
import creditNotesRouter from './routes/back-office/credit-notes';
import feeReportsRouter from './routes/back-office/fee-reports';
import authRouter from './routes/auth';
import glRouter from './routes/back-office/gl';
import circuitBreakerRouter from './routes/back-office/circuit-breakers';
import collectionTriggersRouter from './routes/back-office/collection-triggers';
import tfpEventFeesRouter from './routes/back-office/tfp-event-fees';
import contentPacksRouter from './routes/back-office/content-packs';
import dsarRouter from './routes/back-office/dsar';
import regulatoryCalendarRouter from './routes/back-office/regulatory-calendar';
import campaignRouter from './routes/back-office/campaigns';
import serviceRequestRouter from './routes/back-office/service-requests';
import srDocumentsRouter from './routes/back-office/sr-documents';
import riskProfilingRouter from './routes/back-office/risk-profiling';
import proposalsRouter from './routes/back-office/proposals';
import leadMgmtRouter from './routes/back-office/leads';
import prospectMgmtRouter from './routes/back-office/prospects';
import negativeListRouter from './routes/back-office/negative-list';
import hamRouter from './routes/back-office/handover';
import meetingsRouter from './routes/back-office/meetings';
import callReportsRouter from './routes/back-office/call-reports';
import opportunitiesRouter from './routes/back-office/opportunities';
import crmTasksRouter from './routes/back-office/tasks';
import crmNotificationsRouter from './routes/back-office/notifications';
import crmHandoversRouter from './routes/back-office/crm-handovers';
import eclRouter from './routes/back-office/ecl';
import mfaRouter from './routes/back-office/mfa';

export function registerRoutes(app: Express) {
  // API v1 routes
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', service: 'trustoms-api' });
  });

  // Auth routes (login/refresh are public, others require auth)
  app.use('/api/v1/auth', authRouter);

  // Entity registry — list entities, get entity config, get field configs
  app.use('/api/v1/entity-registry', entityRegistryRouter);

  // Approval queue routes
  app.use('/api/v1/approvals', approvalsRouter);

  // Audit trail routes
  app.use('/api/v1/audit', auditRouter);

  // KYC management routes
  app.use('/api/v1/kyc', kycRouter);

  // Suitability assessment routes
  app.use('/api/v1/suitability', suitabilityRouter);

  // Order management routes
  app.use('/api/v1/orders', ordersRouter);

  // Trades, blocks, and execution routes (Phase 2A)
  app.use('/api/v1/trades', tradesRouter);

  // Confirmation & Matching routes (Phase 2B)
  app.use('/api/v1/confirmations', confirmationsRouter);

  // RM Dashboard routes
  app.use('/api/v1/rm-dashboard', rmDashboardRouter);

  // NAV & Fund Accounting routes (Phase 2C)
  app.use('/api/v1/nav', navRouter);

  // Settlement & Cash Ledger routes (Phase 3A)
  app.use('/api/v1/settlements', settlementsRouter);

  // EOD Processing routes (Phase 3B)
  app.use('/api/v1/eod', eodRouter);

  // Reconciliation routes (Phase 3B)
  app.use('/api/v1/reconciliation', reconRouter);

  // Corporate Actions routes (Phase 3C)
  app.use('/api/v1/corporate-actions', corporateActionsRouter);

  // Fee Engine routes (Phase 3C)
  app.use('/api/v1/fees', feesRouter);

  // Pricing Definitions — TrustFees Pro Phase 2
  app.use('/api/v1/pricing-definitions', pricingDefinitionsRouter);

  // Eligibility Expressions — TrustFees Pro Phase 3
  app.use('/api/v1/eligibility-expressions', eligibilityExpressionsRouter);

  // Accrual Schedule Library — TrustFees Pro Phase 4
  app.use('/api/v1/accrual-schedules', accrualSchedulesRouter);

  // Fee Plan Template Library — TrustFees Pro Phase 4
  app.use('/api/v1/fee-plan-templates', feePlanTemplatesRouter);

  // Fee Plans — TrustFees Pro Phase 5
  app.use('/api/v1/fee-plans', feePlansRouter);

  // TFP Accruals — TrustFees Pro Phase 6
  app.use('/api/v1/tfp-accruals', tfpAccrualsRouter);

  // TFP Invoices — TrustFees Pro Phase 7
  app.use('/api/v1/tfp-invoices', tfpInvoicesRouter);

  // TFP Payments — TrustFees Pro Phase 7
  app.use('/api/v1/tfp-payments', tfpPaymentsRouter);

  // TFP Ad-hoc Fees — TrustFees Pro Phase 7
  app.use('/api/v1/tfp-adhoc-fees', tfpAdhocFeesRouter);

  // Tax Engine routes (Phase 3D)
  app.use('/api/v1/tax', taxRouter);

  // TTRA Lifecycle routes (TRUST-CA 360 Phase 4)
  app.use('/api/v1/ttra', ttraRouter);

  // Claims & Compensation routes (TRUST-CA 360 Phase 6)
  app.use('/api/v1/claims', claimsRouter);

  // Reversals routes (Phase 3E)
  app.use('/api/v1/reversals', reversalsRouter);

  // Bulk Upload routes (Phase 3E)
  app.use('/api/v1/uploads', uploadsRouter);

  // Transfers routes (Phase 3F)
  app.use('/api/v1/transfers', transfersRouter);

  // Contributions routes (Phase 3F)
  app.use('/api/v1/contributions', contributionsRouter);

  // Withdrawals routes (Phase 3F)
  app.use('/api/v1/withdrawals', withdrawalsRouter);

  // Compliance Limits & Pre/Post-Trade Compliance routes (Phase 3G)
  app.use('/api/v1/compliance-limits', complianceLimitsRouter);

  // Portfolio Modeling & Rebalancing routes (Phase 3H)
  app.use('/api/v1/rebalancing', rebalancingRouter);

  // Scheduled Plans (EIP/ERP/Standing Instructions) routes (Phase 3I)
  app.use('/api/v1/scheduled-plans', scheduledPlansRouter);

  // PERA (Personal Equity & Retirement Account) routes (Phase 3I)
  app.use('/api/v1/pera', peraRouter);

  // Risk Analytics (VaR/Duration/IREP) routes (Phase 3J)
  app.use('/api/v1/risk-analytics', riskAnalyticsRouter);

  // Compliance Workbench & Rules Engine routes (Phase 4A)
  app.use('/api/v1/compliance', complianceWorkbenchRouter);

  // Trade Surveillance routes (Phase 4B)
  app.use('/api/v1/surveillance', surveillanceRouter);

  // Kill-Switch routes (Phase 4B)
  app.use('/api/v1/kill-switch', killSwitchRouter);

  // ORE Ledger routes (Phase 4C)
  app.use('/api/v1/ore', oreRouter);

  // Whistleblower routes (Phase 4C)
  app.use('/api/v1/whistleblower', whistleblowerRouter);

  // Executive Dashboard & Operations Control Tower routes (Phase 5B)
  app.use('/api/v1/executive', executiveRouter);

  // Reports & Analytics Hub routes (Phase 5A)
  app.use('/api/v1/reports', reportsRouter);

  // Notification System routes (Phase 5D)
  app.use('/api/v1/notifications', notificationsRouter);

  // Client Self-Service Portal routes (Phase 5C)
  app.use('/api/v1/client-portal', clientPortalRouter);

  // Integration Hub & External Connectors routes (Phase 6A)
  app.use('/api/v1/integrations', integrationsRouter);

  // What-If Scenario Engine & ESG Scoring routes (Phase 6B)
  app.use('/api/v1/scenario', scenarioRouter);

  // AI Suitability Engine & Intelligent Order Routing routes (Phase 6C)
  app.use('/api/v1/ai', aiRouter);

  // Real-time Subscriptions & Collaborative Workspace routes (Phase 6D)
  app.use('/api/v1/realtime', realtimeRouter);

  // Fee Overrides — TrustFees Pro Phase 8
  app.use('/api/v1/fee-overrides', feeOverridesRouter);

  // Exception Queue — TrustFees Pro Phase 8
  app.use('/api/v1/exceptions', exceptionsRouter);

  // Consent & Privacy Center routes (Phase 8)
  app.use('/api/v1/consent', consentRouter);

  // Degraded Mode & Feed Monitor routes (Phase 8)
  app.use('/api/v1/degraded-mode', degradedModeRouter);

  // TFP Audit Trail — TrustFees Pro Phase 9
  app.use('/api/v1/tfp-audit', tfpAuditRouter);

  // Disputes — TrustFees Pro Phase 9
  app.use('/api/v1/disputes', disputesRouter);

  // Credit Notes — TrustFees Pro Phase 9
  app.use('/api/v1/credit-notes', creditNotesRouter);

  // Fee Reports — TrustFees Pro Phase 10
  app.use('/api/v1/fee-reports', feeReportsRouter);

  // Circuit Breaker Dashboard — TrustFees Pro Gap A03
  app.use('/api/v1/circuit-breakers', circuitBreakerRouter);

  // Collection Triggers — TrustFees Pro Gap C12
  app.use('/api/v1/collection-triggers', collectionTriggersRouter);

  // TFP Event Fees — TrustFees Pro Gap C06
  app.use('/api/v1/tfp-event-fees', tfpEventFeesRouter);

  // Content Packs — TrustFees Pro Gap A14/B04
  app.use('/api/v1/content-packs', contentPacksRouter);

  // DSAR Requests — TrustFees Pro Gap A15/B05/B06/B07
  app.use('/api/v1/dsar', dsarRouter);

  // Regulatory Calendar — TrustFees Pro Gap A18/A19
  app.use('/api/v1/regulatory-calendar', regulatoryCalendarRouter);

  // Enterprise GL & Posting Engine routes
  app.use('/api/v1/gl', glRouter);

  // Campaign Management custom routes (lifecycle, dispatch, interactions)
  app.use('/api/v1/campaign-mgmt', campaignRouter);

  // Service Request / Task Management routes
  app.use('/api/v1/service-requests', serviceRequestRouter);

  // Service Request Document Storage routes (Phase 3B)
  app.use('/api/v1/service-requests', srDocumentsRouter);

  // Risk Profiling & Proposal Generation routes (RP-PGM Module)
  app.use('/api/v1/risk-profiling', riskProfilingRouter);
  app.use('/api/v1/proposals', proposalsRouter);

  // Lead Management custom routes (CRM Phase 2 — lifecycle, conversion, sub-entities)
  app.use('/api/v1/lead-mgmt', leadMgmtRouter);

  // Prospect Management custom routes (CRM Phase 2 — lifecycle, conversion, sub-entities)
  app.use('/api/v1/prospect-mgmt', prospectMgmtRouter);

  // Negative List / Screening routes (CRM Phase 3)
  app.use('/api/v1/negative-list', negativeListRouter);

  // Handover & Assignment Management (HAM) routes
  app.use('/api/v1/ham', hamRouter);

  // CRM Meeting Management routes (CRM Phase 7)
  app.use('/api/v1/meetings', meetingsRouter);

  // CRM Call Report routes (CRM Phase 7)
  app.use('/api/v1/call-reports', callReportsRouter);

  // CRM Opportunity Pipeline routes (CRM Phase 8)
  app.use('/api/v1/opportunities', opportunitiesRouter);

  // CRM Task Management routes (CRM Phase 8)
  app.use('/api/v1/crm-tasks', crmTasksRouter);

  // CRM Notification Inbox routes (CRM Phase 8)
  app.use('/api/v1/crm-notifications', crmNotificationsRouter);

  // CRM Handover routes (CRM Phase 9)
  app.use('/api/v1/crm-handovers', crmHandoversRouter);

  // HAM Handover & Assignment Management routes
  app.use('/api/v1/handovers', hamRouter);

  // MFA enrollment & TOTP verification routes
  app.use('/api/v1/mfa', mfaRouter);

  // ECL (Expected Credit Loss) computation routes (FR-MNT-006)
  app.use('/api/v1/ecl', eclRouter);

  // Back-office CRUD routes — all entity data operations
  app.use('/api/v1', backOfficeRouter);
}

// HAM delegation auto-expiry scheduler — runs daily at midnight (BRD HAM-GAP-011)
// Initial run is deferred 60 seconds to let the DB warm up
setTimeout(() => {
  const runDelegationJobs = async () => {
    try {
      const { handoverService } = await import('./services/handover-service');
      await handoverService.processExpiredDelegations();
      await handoverService.processExpiringDelegations();
    } catch (err) {
      console.error('[HAM-Scheduler] delegation job failed:', err);
    }
  };

  // Schedule at next midnight, then repeat every 24 hours
  const scheduleAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // next midnight
    const msUntilMidnight = midnight.getTime() - now.getTime();
    setTimeout(() => {
      runDelegationJobs();
      setInterval(runDelegationJobs, 24 * 60 * 60 * 1000); // every 24 hours
    }, msUntilMidnight);
  };

  runDelegationJobs(); // immediate run on startup
  scheduleAtMidnight();
}, 60 * 1000); // defer 60s after startup

// Campaign activation/completion scheduler — runs every 15 minutes
// Activates APPROVED campaigns, completes expired ACTIVE campaigns, archives stale COMPLETED campaigns, and cancels expired handovers
setTimeout(() => {
  const runCampaignActivationJob = async () => {
    try {
      const { runActivationJob } = await import('./services/campaign-activation-job');
      const { campaignEodBatch } = await import('./services/campaign-service');
      await runActivationJob();
      await campaignEodBatch();
    } catch (err) {
      console.error('[Campaign-Scheduler] activation job failed:', err);
    }
  };
  runCampaignActivationJob();
  setInterval(runCampaignActivationJob, 15 * 60 * 1000); // every 15 minutes
}, 90 * 1000); // defer 90s after startup (after delegation job)

// Lead/prospect retention scheduler — runs nightly at midnight
// Soft-deletes stale dropped / not-interested CRM records after retention period
setTimeout(() => {
  const runLeadProspectRetentionJob = async () => {
    try {
      const { leadService } = await import('./services/lead-service');
      const { prospectService } = await import('./services/prospect-service');
      const retentionDays = parseInt(process.env.CRM_LEAD_PROSPECT_RETENTION_DAYS ?? '365', 10) || 365;
      const [leadsPurged, prospectsPurged] = await Promise.all([
        leadService.processRetentionPurge(retentionDays),
        prospectService.processRetentionPurge(retentionDays),
      ]);
      if (leadsPurged > 0 || prospectsPurged > 0) {
        console.log(`[LeadProspectRetention] Soft-deleted ${leadsPurged} lead(s) and ${prospectsPurged} prospect(s)`);
      }
    } catch (err) {
      console.error('[LeadProspectRetention] retention job failed:', err);
    }
  };

  const scheduleRetentionAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runLeadProspectRetentionJob();
      setInterval(runLeadProspectRetentionJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };

  runLeadProspectRetentionJob();
  scheduleRetentionAtMidnight();
}, 105 * 1000); // defer 105s after startup

// GAP-011: Approval auto-unclaim scheduler — nightly at midnight
// Resets CLAIMED call-report approvals that have been held > 2 business days without a decision
setTimeout(() => {
  const runExpiredClaimsJob = async () => {
    try {
      const { approvalWorkflowService } = await import('./services/approval-workflow-service');
      const released = await approvalWorkflowService.processExpiredClaims();
      if (released > 0) console.log(`[Approval-Scheduler] Released ${released} expired claim(s)`);
    } catch (err) {
      console.error('[Approval-Scheduler] expired-claims job failed:', err);
    }
  };

  const scheduleApprovalJobAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runExpiredClaimsJob();
      setInterval(runExpiredClaimsJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };

  runExpiredClaimsJob();
  scheduleApprovalJobAtMidnight();
}, 120 * 1000); // defer 120s after startup

// GAP-013: Overdue call report alert — daily at 9AM
// Notifies RMs of DRAFT/RETURNED call reports where the meeting was > threshold days ago
setTimeout(() => {
  const runOverdueAlertJob = async () => {
    try {
      const { db: dbRef } = await import('./db');
      const schemaRef = await import('@shared/schema');
      const { notificationInboxService } = await import('./services/notification-inbox-service');
      const { getLateFilingDays } = await import('./services/call-report-service');
      const { and: drAnd, eq: drEq, lte: drLte, or: drOr, sql: drSql } = await import('drizzle-orm');

      const thresholdDays = await getLateFilingDays();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - thresholdDays);

      const overdueReports = await dbRef
        .select({
          id: schemaRef.callReports.id,
          report_code: schemaRef.callReports.report_code,
          filed_by: schemaRef.callReports.filed_by,
        })
        .from(schemaRef.callReports)
        .where(
          drAnd(
            drOr(
              drEq(schemaRef.callReports.report_status, 'DRAFT'),
              drEq(schemaRef.callReports.report_status, 'RETURNED'),
            ),
            drLte(drSql`DATE(${schemaRef.callReports.meeting_date})`, cutoff.toISOString().split('T')[0]),
            drEq(schemaRef.callReports.is_deleted, false),
          ),
        );

      for (const rpt of overdueReports) {
        if (rpt.filed_by) {
          await notificationInboxService.notify({
            recipient_user_id: rpt.filed_by,
            type: 'OVERDUE_CALL_REPORT',
            title: 'Overdue Call Report',
            message: `Call report ${rpt.report_code} is overdue. Please submit it as soon as possible to avoid late-filing escalation.`,
            channel: 'IN_APP',
            related_entity_type: 'call_report',
            related_entity_id: rpt.id,
          });
        }
      }

      if (overdueReports.length > 0) {
        console.log(`[OverdueAlert] Sent overdue reminders for ${overdueReports.length} call report(s)`);
      }
    } catch (err) {
      console.error('[OverdueAlert] Error running overdue alert job:', err);
    }
  };

  const scheduleOverdueAlertAt9AM = () => {
    const now = new Date();
    const next9AM = new Date(now);
    next9AM.setHours(9, 0, 0, 0);
    if (next9AM <= now) next9AM.setDate(next9AM.getDate() + 1);
    setTimeout(() => {
      runOverdueAlertJob();
      setInterval(runOverdueAlertJob, 24 * 60 * 60 * 1000);
    }, next9AM.getTime() - now.getTime());
  };

  scheduleOverdueAlertAt9AM();
}, 150 * 1000); // defer 150s after startup

// GAP-002: Opportunity auto-expiry — nightly at midnight
// Sets opportunities with past expected_close_date to EXPIRED if still in active stages
setTimeout(() => {
  const runOpportunityExpiryJob = async () => {
    try {
      const { opportunityService } = await import('./services/opportunity-service');
      const expiredCount = await opportunityService.processExpiredOpportunities();
      if (expiredCount > 0) {
        console.log(`[OpportunityExpiry] Expired ${expiredCount} overdue opportunity/ies`);
      }
    } catch (err) {
      console.error('[OpportunityExpiry] Error running opportunity expiry job:', err);
    }
  };

  const scheduleOpportunityExpiryAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runOpportunityExpiryJob();
      setInterval(runOpportunityExpiryJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };

  runOpportunityExpiryJob();
  scheduleOpportunityExpiryAtMidnight();
}, 180 * 1000); // defer 180s after startup

// FR-019: Auto-transition stale SCHEDULED meetings to NO_SHOW — nightly at midnight
setTimeout(() => {
  const runMeetingNoShowJob = async () => {
    try {
      const { meetingService } = await import('./services/meeting-service');
      const noShowCount = await meetingService.processNoShowMeetings();
      if (noShowCount > 0) {
        console.log(`[MeetingNoShow] Marked ${noShowCount} meeting(s) as no-show`);
      }
    } catch (err) {
      console.error('[MeetingNoShow] Error running no-show job:', err);
    }
  };

  const scheduleMeetingNoShowAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runMeetingNoShowJob();
      setInterval(runMeetingNoShowJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };

  runMeetingNoShowJob();
  scheduleMeetingNoShowAtMidnight();
}, 210 * 1000); // defer 210s after startup

// BR-032: SLA alert — SUBMITTED call reports >48h without review → notify BO_HEAD
// Runs nightly at midnight
setTimeout(() => {
  const runCallReportSlaAlertJob = async () => {
    try {
      const { db: dbRef } = await import('./db');
      const schemaRef = await import('@shared/schema');
      const { eq: drEq, and: drAnd, lte: drLte, inArray: drInArray } = await import('drizzle-orm');
      const { notificationInboxService: notifSvc } = await import('./services/notification-inbox-service');

      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 48);

      const stalePending = await dbRef
        .select({ id: schemaRef.callReports.id, report_code: schemaRef.callReports.report_code, branch_id: schemaRef.callReports.branch_id })
        .from(schemaRef.callReports)
        .where(drAnd(
          drEq(schemaRef.callReports.report_status, 'PENDING_APPROVAL'),
          drLte(schemaRef.callReports.updated_at, cutoff),
        ));

      for (const report of stalePending) {
        // Find BO_HEAD users in the same branch
        const boHeads = await dbRef
          .select({ id: schemaRef.users.id })
          .from(schemaRef.users)
          .where(drEq((schemaRef.users as any).role, 'BO_HEAD'));
        const recipientIds = boHeads.map((u: { id: number }) => u.id);
        if (recipientIds.length > 0) {
          await notifSvc.notifyMultiple(recipientIds, {
            type: 'CALL_REPORT_SLA_BREACH',
            title: 'Call Report SLA Breach',
            message: `Call report ${report.report_code} has been pending approval for more than 48 hours.`,
            channel: 'IN_APP',
            related_entity_type: 'call_report',
            related_entity_id: report.id,
          });
        }
      }

      if (stalePending.length > 0) {
        console.log(`[CallReportSLA] Alerted BO_HEAD for ${stalePending.length} stale pending report(s)`);
      }
    } catch (err) {
      console.error('[CallReportSLA] Error running SLA alert job:', err);
    }
  };

  const scheduleCallReportSlaAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runCallReportSlaAlertJob();
      setInterval(runCallReportSlaAlertJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };

  runCallReportSlaAlertJob();
  scheduleCallReportSlaAtMidnight();
}, 240 * 1000); // defer 240s after startup

// P1-13: Meeting reminder notifications — runs every hour
// Queries meetings needing reminders and dispatches in-app notifications to organiser
setTimeout(() => {
  const runMeetingReminderJob = async () => {
    try {
      const { meetingService } = await import('./services/meeting-service');
      const { notificationInboxService: notifSvc } = await import('./services/notification-inbox-service');
      const pendingReminders = await meetingService.getPendingReminders();
      for (const meeting of pendingReminders) {
        if (meeting.organizer_user_id) {
          await notifSvc.notify({
            recipient_user_id: meeting.organizer_user_id,
            type: 'MEETING_REMINDER',
            title: 'Meeting Reminder',
            message: `Reminder: "${meeting.title}" is scheduled for ${new Date(meeting.start_time).toLocaleString()}.`,
            channel: 'IN_APP',
            related_entity_type: 'meeting',
            related_entity_id: meeting.id,
          });
        }
        await meetingService.markReminderSent(meeting.id, '1h');
      }
      if (pendingReminders.length > 0) {
        console.log(`[MeetingReminder] Sent ${pendingReminders.length} reminder(s)`);
      }
    } catch (err) {
      console.error('[MeetingReminder] Error running reminder job:', err);
    }
  };
  runMeetingReminderJob();
  setInterval(runMeetingReminderJob, 60 * 60 * 1000); // every hour
}, 270 * 1000); // defer 270s after startup

// GAP-037: 24-hour advance meeting reminder — runs every hour
// Notifies organiser 24h ahead of meeting (separate from the 1h reminder above)
setTimeout(() => {
  const run24hReminderJob = async () => {
    try {
      const { meetingService } = await import('./services/meeting-service');
      const { notificationInboxService: notifSvc } = await import('./services/notification-inbox-service');
      const meetings = await meetingService.get24hPendingReminders();
      for (const meeting of meetings) {
        if (meeting.organizer_user_id) {
          await notifSvc.notify({
            recipient_user_id: meeting.organizer_user_id,
            type: 'MEETING_REMINDER',
            title: 'Meeting Tomorrow',
            message: `Reminder: "${meeting.title}" is scheduled for ${new Date(meeting.start_time).toLocaleString()} — approximately 24 hours from now.`,
            channel: 'IN_APP',
            related_entity_type: 'meeting',
            related_entity_id: meeting.id,
          });
        }
        await meetingService.markReminderSent(meeting.id, '24h');
      }
      if (meetings.length > 0) {
        console.log(`[Meeting24hReminder] Sent ${meetings.length} 24-hour reminder(s)`);
      }
    } catch (err) {
      console.error('[Meeting24hReminder] Error running 24h reminder job:', err);
    }
  };
  run24hReminderJob();
  setInterval(run24hReminderJob, 60 * 60 * 1000); // every hour
}, 300 * 1000); // defer 300s after startup

// BR-053: Task reminder notifications — runs daily at 8AM
// Notifies assignees of tasks whose reminder_date is today
setTimeout(() => {
  const runTaskReminderJob = async () => {
    try {
      const { taskManagementService } = await import('./services/task-management-service');
      const { notificationInboxService: notifSvc } = await import('./services/notification-inbox-service');
      const tasksDue = await taskManagementService.getTasksNeedingReminder();
      for (const task of tasksDue) {
        const recipientId = task.assigned_to ?? (task as any).created_by_user_id;
        if (recipientId && typeof recipientId === 'number') {
          await notifSvc.notify({
            recipient_user_id: recipientId,
            type: 'TASK_REMINDER',
            title: 'Task Reminder',
            message: `Reminder: Task "${task.title}" (${task.task_code}) is due on ${task.due_date}.`,
            channel: 'IN_APP',
            related_entity_type: 'crm_task',
            related_entity_id: task.id,
          });
        }
      }
      if (tasksDue.length > 0) {
        console.log(`[TaskReminder] Sent ${tasksDue.length} task reminder(s)`);
      }
    } catch (err) {
      console.error('[TaskReminder] Error running task reminder job:', err);
    }
  };
  const scheduleTaskReminderAt8AM = () => {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (next8AM <= now) next8AM.setDate(next8AM.getDate() + 1);
    setTimeout(() => {
      runTaskReminderJob();
      setInterval(runTaskReminderJob, 24 * 60 * 60 * 1000);
    }, next8AM.getTime() - now.getTime());
  };
  runTaskReminderJob();
  scheduleTaskReminderAt8AM();
}, 300 * 1000); // defer 300s after startup

// P2-20: Completed action items archival — runs nightly at midnight
// Action items COMPLETED more than 90 days ago are soft-deleted (archived)
setTimeout(() => {
  const runActionItemArchivalJob = async () => {
    try {
      const { db: dbRef } = await import('./db');
      const schemaRef = await import('@shared/schema');
      const { and: drAnd, eq: drEq, lte: drLte } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const archived = await dbRef
        .update(schemaRef.actionItems)
        .set({ is_deleted: true, updated_at: new Date() } as any)
        .where(drAnd(
          drEq(schemaRef.actionItems.status, 'COMPLETED'),
          drLte(schemaRef.actionItems.completed_at, cutoff),
          drEq(schemaRef.actionItems.is_deleted, false),
        ))
        .returning({ id: schemaRef.actionItems.id });
      if (archived.length > 0) {
        console.log(`[ActionItemArchival] Archived ${archived.length} completed action item(s) older than 90 days`);
      }
    } catch (err) {
      console.error('[ActionItemArchival] Error running archival job:', err);
    }
  };
  const scheduleArchivalAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runActionItemArchivalJob();
      setInterval(runActionItemArchivalJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };
  runActionItemArchivalJob();
  scheduleArchivalAtMidnight();
}, 330 * 1000); // defer 330s after startup

// G-091: Proposal auto-expiry — nightly at midnight
// SENT_TO_CLIENT proposals whose expires_at has passed are transitioned to EXPIRED
setTimeout(() => {
  const runProposalExpiryJob = async () => {
    try {
      const { db: dbRef } = await import('./db');
      const schemaRef = await import('@shared/schema');
      const { and: drAnd, eq: drEq, lte: drLte } = await import('drizzle-orm');
      const now = new Date();
      const expired = await dbRef
        .update(schemaRef.investmentProposals)
        .set({ proposal_status: 'EXPIRED', updated_at: new Date(), updated_by: 'system-expiry-job' } as any)
        .where(drAnd(
          drEq(schemaRef.investmentProposals.proposal_status, 'SENT_TO_CLIENT'),
          drLte(schemaRef.investmentProposals.expires_at, now),
          drEq(schemaRef.investmentProposals.is_deleted, false),
        ))
        .returning({ id: schemaRef.investmentProposals.id });
      if (expired.length > 0) {
        console.log(`[ProposalExpiry] Expired ${expired.length} proposal(s)`);
      }
    } catch (err) {
      console.error('[ProposalExpiry] Error running proposal expiry job:', err);
    }
  };
  const scheduleProposalExpiryAtMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      runProposalExpiryJob();
      setInterval(runProposalExpiryJob, 24 * 60 * 60 * 1000);
    }, midnight.getTime() - now.getTime());
  };
  runProposalExpiryJob();
  scheduleProposalExpiryAtMidnight();
}, 360 * 1000); // defer 360s after startup

// HAM-GAP-008: Handover SLA alert — runs every hour
// Notifies the requesting_rm + checker supervisor when a handover breaches its sla_deadline
setTimeout(() => {
  const runHandoverSlaAlertJob = async () => {
    try {
      const { handoverService } = await import('./services/handover-service');
      const { notificationInboxService: notifSvc } = await import('./services/notification-inbox-service');
      const breached = await handoverService.getSlaBreachedHandovers();
      for (const h of breached) {
        const recipients = [h.outgoing_rm_id, h.incoming_rm_id].filter(Boolean) as number[];
        for (const recipientId of recipients) {
          await notifSvc.notify({
            recipient_user_id: recipientId,
            type: 'HANDOVER_SLA_BREACH',
            title: 'Handover SLA Breached',
            message: `Handover request (ID: ${h.id}) has exceeded its SLA deadline and is awaiting authorization.`,
            channel: 'IN_APP',
            related_entity_type: 'handover',
            related_entity_id: h.id,
          });
        }
      }
      if (breached.length > 0) {
        console.log(`[HandoverSLA] Alerted for ${breached.length} SLA-breached handover(s)`);
      }
    } catch (err) {
      console.error('[HandoverSLA] Error running SLA alert job:', err);
    }
  };
  runHandoverSlaAlertJob();
  setInterval(runHandoverSlaAlertJob, 60 * 60 * 1000); // every hour
}, 420 * 1000); // defer 420s after startup
