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

  // Enterprise GL & Posting Engine routes
  app.use('/api/v1/gl', glRouter);

  // Back-office CRUD routes — all entity data operations
  app.use('/api/v1', backOfficeRouter);
}
